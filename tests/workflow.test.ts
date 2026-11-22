import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { createApplication } from '../api/main';
import {
  Database,
  type Actor,
  totp,
  newTotp,
  passwordHash,
  audit,
  auditEventIntegrity,
  canonical,
  digest,
} from '../api/core';
import { seed } from '../api/setup';
import { classify, validateRule } from '../api/registry-rules';
import { dueDate } from '../api/monitoring';
import { capture, encodeBackup, decodeBackup, verifyBackup } from '../api/backup';
import { FileStore } from '../api/documents';
let app: Awaited<ReturnType<typeof createApplication>>,
  db: Database,
  base: string,
  data: any,
  pdf: Buffer;
const password = 'Sislam-Tests-Only-2026!',
  cookies: Record<string, string> = {};
async function request(
  method: string,
  route: string,
  body?: unknown,
  role = 'admin',
  origin = 'http://localhost:3400',
) {
  const headers: Record<string, string> = { Origin: origin };
  if (cookies[role]) headers.Cookie = cookies[role];
  if (body !== undefined && !(body instanceof FormData))
    headers['Content-Type'] = 'application/json';
  return fetch(base + '/api/' + route, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
}
async function json(method: string, route: string, body?: unknown, role = 'admin') {
  const response = await request(method, route, body, role),
    value = await response.json();
  if (!response.ok) throw Error(`${response.status}: ${JSON.stringify(value)}`);
  return value;
}
beforeAll(async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sislam-test-'));
  app = await createApplication();
  db = app.get(Database);
  await db.migrate();
  data = await seed(db, password);
  await app.listen(0, '127.0.0.1');
  base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
  for (const slug of Object.keys(data.actors)) {
    const response = await request(
      'POST',
      'auth/login',
      { email: `${slug}@demo.sislam.test`, password },
      'guest',
    );
    expect(response.status).toBe(201);
    cookies[slug] = response.headers.get('set-cookie')!.split(';')[0];
  }
  const document = await PDFDocument.create();
  document.addPage();
  pdf = Buffer.from(await document.save());
});
afterAll(async () => {
  await app?.close();
  await db?.close();
});
describe('SISLAM — isolamento e fluxo verificável', () => {
  it('exige autenticação e origem segura e impede que outro perfil emita parecer', async () => {
    expect((await request('GET', 'cases', undefined, 'guest')).status).toBe(401);
    expect((await request('POST', 'cases', {}, 'requerente', 'https://outro.exemplo')).status).toBe(
      403,
    );
    expect(
      (
        await request(
          'POST',
          `cases/${data.caseIds[0]}/opinion`,
          { text: 'Parecer fictício para conferência', conclusion: 'favorable', reviewed: true },
          'protocolo',
        )
      ).status,
    ).toBe(403);
  });
  it('aplica RLS mesmo quando a consulta esquece o filtro de município e rejeita FK cruzada', async () => {
    const main = await db.tenant(
      data.actors.admin,
      async (q) => (await q.query('SELECT name FROM organizations')).rows,
    );
    expect(main.length).toBe(8);
    expect(main.some((r) => r.name.includes('homologação'))).toBe(false);
    const other = await db.tenant(
      { ...data.actors.admin, municipalityId: data.other.id },
      async (q) => (await q.query('SELECT name FROM organizations')).rows,
    );
    expect(other).toHaveLength(1);
    await expect(
      db.tenant(data.actors.admin, (q) =>
        q.query(
          'INSERT INTO establishments(municipality_id,organization_id,name,activity,address,capacity,area) VALUES($1,$2,$3,$4,$5,1,1)',
          [
            data.municipality.id,
            data.otherOrg.id,
            'Tentativa cruzada',
            'DEMO-MADEIRA',
            'Endereço de teste',
          ],
        ),
      ),
    ).rejects.toThrow();
  });
  it('não concede acesso irrestrito ao fornecedor nem expõe denúncias ao administrador', async () => {
    expect((await request('GET', 'cases', undefined, 'fornecedor')).status).toBe(403);
    expect((await request('GET', 'complaints')).status).toBe(403);
    expect((await json('GET', 'complaints', undefined, 'ouvidoria')).length).toBe(1);
    const rows = await db.tenant(
      data.actors.admin,
      async (q) => (await q.query('SELECT * FROM complaint_contacts')).rows,
    );
    expect(rows).toEqual([]);
  });
  it('apresenta 2 de 3 anexos e bloqueia parecer favorável e decisão com pendência', async () => {
    const detail = await json('GET', `cases/${data.caseIds[0]}`);
    expect(detail.checklist).toHaveLength(3);
    expect(detail.documents).toHaveLength(2);
    const response = await request(
      'POST',
      `cases/${data.caseIds[0]}/opinion`,
      {
        conclusion: 'favorable',
        text: 'Parecer demonstrativo com documentação ainda pendente',
        reviewed: true,
      },
      'tecnico',
    );
    expect(response.status).toBe(400);
    expect(
      (
        await request(
          'POST',
          `cases/${data.caseIds[0]}/license`,
          {
            validUntil: '2028-01-01',
            text: 'Licença demonstrativa sem revisão técnica suficiente',
            confirmed: true,
          },
          'autoridade',
        )
      ).status,
    ).toBe(400);
  });
  it('separa recebimento administrativo da revisão técnica', async () => {
    const detail = await json('GET', `cases/${data.caseIds[0]}`),
      document = detail.documents[0];
    expect(
      (
        await request(
          'POST',
          `documents/${document.id}/review`,
          { status: 'accepted', note: 'Peça conferida pelo técnico responsável' },
          'tecnico',
        )
      ).status,
    ).toBe(400);
    await json('POST', `documents/${document.id}/receive`, {}, 'protocolo');
    await json(
      'POST',
      `documents/${document.id}/review`,
      { status: 'accepted', note: 'Peça conferida no cenário demonstrativo' },
      'tecnico',
    );
  });
  it('preserva original e SHA-256 em reenvio e rejeita conteúdo disfarçado', async () => {
    async function upload(buffer: Buffer, type = 'application/pdf') {
      const f = new FormData();
      f.set('requirementKey', 'cadastro');
      f.set('file', new Blob([new Uint8Array(buffer)], { type }), 'teste.pdf');
      return request('POST', `documents/cases/${data.caseIds[1]}`, f, 'requerente');
    }
    const first = await (await upload(pdf)).json(),
      second = await (await upload(Buffer.concat([pdf, Buffer.from('\n%nova-versao')]))).json();
    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(first.sha256).not.toBe(second.sha256);
    const response = await request(
      'GET',
      `documents/${first.id}/download`,
      undefined,
      'requerente',
    );
    expect(Buffer.from(await response.arrayBuffer()).equals(pdf)).toBe(true);
    expect((await upload(Buffer.from('<script>não é pdf</script>'))).status).toBe(400);
  });
  it('congela a versão da regra no protocolo e não inventa saída em conflito ou falta de regra', async () => {
    const before = await json('GET', `cases/${data.caseIds[0]}`),
      rule = (await json('GET', 'rules'))[0];
    await json('POST', 'rules', {
      activity: rule.activity,
      title: 'Nova revisão demonstrativa em elaboração',
      status: 'draft',
      validFrom: '2026-01-01',
      validUntil: null,
      sourceReference: 'DEMO — versão nova ainda em revisão',
      definition: {
        ...rule.definition,
        bands: [
          {
            max: 20,
            label: 'Alteração de exemplo',
            potential: 'baixo',
            modality: 'Modelo demonstrativo',
          },
        ],
      },
    });
    const after = await json('GET', `cases/${data.caseIds[0]}`);
    expect(after.rule_snapshot).toEqual(before.rule_snapshot);
    expect(after.rule_snapshot.version).toBe(1);
    expect(classify([], 20)).toMatchObject({ manual: true });
    expect(classify([rule, rule], 20)).toMatchObject({ manual: true });
    expect(classify([rule], 100000)).toMatchObject({ manual: true });
    await expect(
      db.tenant(data.actors.admin, (q) =>
        q.query('UPDATE rule_versions SET title=$1 WHERE id=$2', ['Mudança indevida', rule.id]),
      ),
    ).rejects.toThrow();
  });
  it('não conta prazo antes de ciência e a expedição demonstrativa não envia e-mail', async () => {
    const notice = await json(
      'POST',
      `cases/${data.caseIds[0]}/notices`,
      {
        title: 'Solicitação de complemento demonstrativa',
        text: 'Apresente a planta de localização, item ausente no dossiê de demonstração.',
        days: 5,
        counting: 'business',
        deadlineBasis:
          'Parâmetro demonstrativo escolhido para o teste, sem prazo legal homologado.',
      },
      'tecnico',
    );
    expect(notice.due_date).toBeNull();
    await json('POST', `notices/${notice.id}/action`, { action: 'approve' }, 'autoridade');
    const dispatch = await json(
      'POST',
      `notices/${notice.id}/action`,
      { action: 'dispatch_demo' },
      'protocolo',
    );
    expect(dispatch.emailSent).toBe(false);
    expect(
      (
        await request(
          'POST',
          `notices/${notice.id}/action`,
          { action: 'acknowledge_demo' },
          'protocolo',
        )
      ).status,
    ).toBe(400);
    const before = (await json('GET', 'notices')).find((n: any) => n.id === notice.id);
    expect(before.due_date).toBeNull();
    await json(
      'POST',
      `notices/${notice.id}/action`,
      {
        action: 'acknowledge_demo',
        evidence: 'Comprovante fictício de ciência em ambiente de teste',
        acknowledgedAt: new Date().toISOString(),
      },
      'protocolo',
    );
    const after = (await json('GET', 'notices')).find((n: any) => n.id === notice.id);
    expect(after.due_date).toBeTruthy();
  });
  it('completa documentação, parecer, decisão separada, PDF verificável e condicionante', async () => {
    const caseId = data.caseIds[0],
      upload = new FormData();
    upload.set('requirementKey', 'planta');
    upload.set('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), 'planta.pdf');
    await json('POST', `documents/cases/${caseId}`, upload, 'requerente');
    for (const document of (await json('GET', `cases/${caseId}`)).documents) {
      if (document.status === 'sent')
        await json('POST', `documents/${document.id}/receive`, {}, 'protocolo');
      if (document.status !== 'accepted')
        await json(
          'POST',
          `documents/${document.id}/review`,
          { status: 'accepted', note: 'Documento recebido e analisado no cenário fictício' },
          'tecnico',
        );
    }
    const current = await json('GET', `cases/${caseId}`);
    await json(
      'POST',
      `cases/${caseId}/transition`,
      {
        to: 'analysis',
        reason: 'Documentação recebida para análise técnica',
        revision: current.revision,
      },
      'tecnico',
    );
    await json(
      'POST',
      `cases/${caseId}/opinion`,
      {
        conclusion: 'favorable',
        text: 'Parecer demonstrativo: documentação conferida e cenário de teste aprovado para revisão da autoridade.',
        reviewed: true,
      },
      'tecnico',
    );
    const analyzed = await json('GET', `cases/${caseId}`);
    await json(
      'POST',
      `cases/${caseId}/transition`,
      {
        to: 'decision',
        reason: 'Parecer revisado e encaminhado à autoridade',
        revision: analyzed.revision,
      },
      'tecnico',
    );
    const license = await json(
      'POST',
      `cases/${caseId}/license`,
      {
        validUntil: '2028-01-01',
        text: 'Licença-modelo do SISLAM, emitida apenas para testar o fluxo, sem validade jurídica ou assinatura oficial.',
        confirmed: true,
      },
      'autoridade',
    );
    expect(
      (await request('GET', `public/license/${license.verification_code}`, undefined, 'guest'))
        .status,
    ).toBe(404);
    await json('POST', `licenses/${license.id}/publish`, {}, 'autoridade');
    const verified = await json(
      'GET',
      `public/license/${license.verification_code}`,
      undefined,
      'guest',
    );
    expect(verified.officialValidity).toBe(false);
    const pdfResult = await request('GET', `licenses/${license.id}/pdf`);
    expect(pdfResult.headers.get('content-type')).toContain('application/pdf');
    expect(
      Buffer.from(await pdfResult.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
    const condition = await json(
      'POST',
      `licenses/${license.id}/conditions`,
      {
        title: 'Apresentar relatório de acompanhamento demonstrativo',
        responsible: 'Responsável fictício',
        dueDate: '2027-01-15',
      },
      'autoridade',
    );
    expect(condition.status).toBe('pending');
    const evidence = new FormData();
    evidence.set('requirementKey', 'evidence_' + condition.id.replaceAll('-', ''));
    evidence.set(
      'file',
      new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
      'comprovacao.pdf',
    );
    const document = await json('POST', `documents/cases/${caseId}`, evidence, 'requerente');
    await json(
      'POST',
      `conditions/${condition.id}/evidence`,
      { documentId: document.id },
      'requerente',
    );
    await json(
      'POST',
      `conditions/${condition.id}/review`,
      { status: 'fulfilled', note: 'Comprovação verificada no cenário de demonstração' },
      'tecnico',
    );
  });
  it('mantém a denúncia em apuração após requerimento, até conclusão expressa', async () => {
    const complaint = (await json('GET', 'complaints', undefined, 'ouvidoria'))[0];
    expect(complaint.status).toBe('received');
    expect(
      (
        await request(
          'POST',
          `complaints/${complaint.id}/transition`,
          { to: 'archived', reason: 'Não houve apuração do objeto da denúncia ainda' },
          'ouvidoria',
        )
      ).status,
    ).toBe(400);
  });
  it('verifica a cadeia de auditoria e impede alterações dos eventos', async () => {
    const result = await json('GET', 'admin/audit/verify');
    expect(result.valid).toBe(true);
    expect(result.events).toBeGreaterThan(20);
    await expect(
      db.tenant(data.actors.admin, (q) =>
        q.query('UPDATE audit_events SET action=$1', ['mudança']),
      ),
    ).rejects.toThrow();
  });
  it('calcula dias úteis com calendário explícito e códigos TOTP sem aprovação automática', () => {
    expect(dueDate('2026-11-20', 1, 'calendar')).toBe('2026-11-21');
    expect(dueDate('2026-11-20', 1, 'business', ['2026-11-23'])).toBe('2026-11-24');
    const secret = newTotp();
    expect(totp(secret)).toMatch(/^\d{6}$/);
  });
  it('conclui indeferimento fundamentado sem gerar licença e preserva a proposta original', async () => {
    const caseId = data.caseIds[1],
      before = await json('GET', `cases/${caseId}`);
    await json(
      'POST',
      `cases/${caseId}/classification`,
      {
        label: 'Porte revisado na demonstração',
        potential: 'médio',
        modality: 'Modalidade demonstrativa revisada',
        source: 'Parecer técnico fictício de teste',
        reason:
          'Revisão técnica demonstrativa, sem interpretação de normas reais ou alteração da proposta anterior.',
        requirements: before.classification.requirements,
      },
      'tecnico',
    );
    const after = await json('GET', `cases/${caseId}`);
    expect(after.rule_snapshot).toEqual(before.rule_snapshot);
    expect(after.classification.technicallyReviewed).toBe(true);
    await json(
      'POST',
      `cases/${caseId}/opinion`,
      {
        conclusion: 'unfavorable',
        text: 'Conclusão desfavorável demonstrativa, devidamente fundamentada para testar o rito de indeferimento.',
        reviewed: true,
      },
      'tecnico',
    );
    const current = await json('GET', `cases/${caseId}`);
    await json(
      'POST',
      `cases/${caseId}/transition`,
      {
        to: 'decision',
        revision: current.revision,
        reason: 'Encaminhamento de parecer desfavorável revisado',
      },
      'tecnico',
    );
    await json(
      'POST',
      `cases/${caseId}/refuse`,
      {
        reason:
          'Indeferimento de demonstração fundamentado no parecer revisado, sem emissão de licença ou ato oficial.',
        confirmed: true,
      },
      'autoridade',
    );
    const closed = await json('GET', `cases/${caseId}`);
    expect(closed.status).toBe('closed');
    expect(closed.decision_outcome).toBe('refused_demo');
    expect(closed.licenses).toHaveLength(0);
  });
  it('limita o suporte a leitura autorizada, registra consultas e revoga imediatamente', async () => {
    const grant = await json('POST', 'admin/support-grants', {
      userId: data.actors.fornecedor.id,
      minutes: 5,
      reason: 'Diagnóstico de demonstração autorizado pelo município',
      confirmed: true,
    });
    expect((await request('GET', 'cases', undefined, 'fornecedor')).status).toBe(200);
    expect((await request('POST', 'cases', {}, 'fornecedor')).status).toBe(403);
    await json('POST', `admin/support-grants/${grant.id}/revoke`, {});
    expect((await request('GET', 'cases', undefined, 'fornecedor')).status).toBe(403);
    expect(
      (await json('GET', 'admin/audit')).some(
        (event: any) => event.action === 'support.resource_accessed',
      ),
    ).toBe(true);
  });
  it('exige MFA no modo operacional e recusa reutilização de código TOTP', async () => {
    const setup = await json('POST', 'auth/mfa/setup', { password });
    process.env.SISLAM_DEMO = '0';
    try {
      expect((await request('GET', 'cases')).status).toBe(403);
      const code = totp(setup.secret);
      await json('POST', 'auth/mfa/verify', { code });
      expect((await request('GET', 'cases')).status).toBe(200);
      expect((await request('POST', 'auth/mfa/verify', { code })).status).toBe(401);
    } finally {
      process.env.SISLAM_DEMO = '1';
    }
  });
  it('impede que um segundo requerente enumere ou abra os processos e documentos de outro', async () => {
    await db.system(async (q) => {
      const person = (
        await q.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id', [
          'isolado@demo.sislam.test',
          'Requerente isolado de teste',
          passwordHash(password),
        ])
      ).rows[0];
      await q.query(
        "INSERT INTO memberships(municipality_id,user_id,role) VALUES($1,$2,'applicant')",
        [data.municipality.id, person.id],
      );
    });
    const response = await request(
      'POST',
      'auth/login',
      { email: 'isolado@demo.sislam.test', password },
      'guest',
    );
    expect(response.status).toBe(201);
    cookies.isolado = response.headers.get('set-cookie')!.split(';')[0];
    expect(
      await json('GET', 'cases?municipalityId=' + data.other.id, undefined, 'isolado'),
    ).toHaveLength(0);
    expect((await request('GET', 'cases/' + data.caseIds[0], undefined, 'isolado')).status).toBe(
      404,
    );
    expect(await json('GET', 'documents', undefined, 'isolado')).toHaveLength(0);
    expect((await json('GET', 'registry', undefined, 'isolado')).organizations).toHaveLength(0);
  });
  it('cifra a identidade do denunciante e não a entrega ao fiscal nem ao administrador', async () => {
    const contact = 'Contato fictício e protegido da denúncia';
    const complaint = await json(
      'POST',
      'complaints',
      {
        title: 'Denúncia identificada de teste',
        narrative: 'Relato fictício usado para conferir a proteção da identidade do denunciante.',
        location: 'Localização fictícia de teste',
        contact,
      },
      'ouvidoria',
    );
    const rows = await db.system(
      async (q) =>
        (
          await q.query('SELECT encrypted_contact FROM complaint_contacts WHERE complaint_id=$1', [
            complaint.id,
          ])
        ).rows,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].encrypted_contact).not.toContain(contact);
    for (const actor of [data.actors.admin, data.actors.fiscal])
      expect(
        await db.tenant(
          actor,
          async (q) => (await q.query('SELECT * FROM complaint_contacts')).rows,
        ),
      ).toEqual([]);
    expect(JSON.stringify(await json('GET', 'complaints', undefined, 'fiscal'))).not.toContain(
      contact,
    );
  });
  it('preserva a integridade ao protocolar novo requerimento e serializar valores opcionais', async () => {
    const original = await json('GET', `cases/${data.caseIds[0]}`);
    const created = await json(
      'POST',
      'cases',
      {
        establishmentId: original.establishment_id,
        title: 'Novo requerimento fictício para regressão da auditoria',
      },
      'requerente',
    );
    const filed = await json(
      'POST',
      `cases/${created.id}/file`,
      {
        revision: created.revision,
        confirmed: true,
      },
      'requerente',
    );
    expect(filed.classification.manual).toBe(false);
    await db.tenant(data.actors.admin, (q) =>
      audit(q, data.actors.admin, 'test.serialization', {
        omitted: undefined,
        nested: { omitted: undefined, kept: null },
        values: [undefined, null, 3],
        at: new Date('2026-11-22T12:00:00Z'),
      }),
    );
    const row = await db.tenant(
      data.actors.admin,
      async (q) =>
        (await q.query("SELECT * FROM audit_events WHERE action='test.serialization'")).rows[0],
    );
    expect(row.serialization_version).toBe(2);
    expect(row.payload).toMatchObject({
      nested: { kept: null },
      values: [null, null, 3],
      at: '2026-11-22T12:00:00.000Z',
    });
    expect(row.payload).not.toHaveProperty('omitted');
    expect((await json('GET', 'admin/audit/verify')).valid).toBe(true);
    expect(auditEventIntegrity({ ...row, serialization_version: 1 })).toBe(false);
    expect(auditEventIntegrity({ ...row, payload: { ...row.payload, extra: 'adulteração' } })).toBe(
      false,
    );
  });
  it('confere o digest legado sem alterar eventos e rejeita qualquer conteúdo divergente', () => {
    const payload = {
      classification: {
        manual: false,
        demonstration: true,
        reason: undefined,
        label: 'Demonstração',
      },
    };
    const value = {
      id: 'evento',
      municipalityId: 'município',
      actorId: 'autor',
      caseId: null,
      sequence: 1,
      action: 'case.filed',
      payload,
      previous: 'GENESIS',
      at: '2026-11-22T00:00:00.000Z',
    };
    const row = {
      id: value.id,
      municipality_id: value.municipalityId,
      actor_id: value.actorId,
      case_id: value.caseId,
      sequence: 1,
      action: value.action,
      payload: JSON.parse(JSON.stringify(payload)),
      previous_hash: 'GENESIS',
      created_at: value.at,
      event_hash: digest(canonical(value)),
      serialization_version: 1,
    };
    const snapshot = JSON.stringify(row);
    expect(auditEventIntegrity(row)).toBe('legacy_undefined_reason');
    expect(JSON.stringify(row)).toBe(snapshot);
    expect(auditEventIntegrity({ ...row, action: 'case.created' })).toBe(false);
    expect(auditEventIntegrity({ ...row, event_hash: '0'.repeat(64) })).toBe(false);
    expect(auditEventIntegrity({ ...row, serialization_version: 2 })).toBe(false);
    expect(
      auditEventIntegrity({
        ...row,
        payload: { classification: { ...row.payload.classification, label: 'Alterado' } },
      }),
    ).toBe(false);
  });
  it('restaura backup criptografado com todas as tabelas, versões e anexos e rejeita adulteração', async () => {
    const snapshot = await capture(db, new FileStore()),
      encoded = encodeBackup(snapshot),
      decoded = decodeBackup(encoded);
    expect(encoded.toString()).not.toContain('password_hash');
    expect(encoded.toString()).not.toContain('Marina Santos');
    const result = await verifyBackup(decoded);
    expect(result.verified).toBe(true);
    expect(result.files).toBeGreaterThan(2);
    const count = await db.system(
      async (q) =>
        (await q.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'"))
          .rows[0].n,
    );
    expect(result.tables).toBe(count);
    const damaged = Buffer.from(encoded);
    damaged[damaged.length - 1] ^= 1;
    expect(() => decodeBackup(damaged)).toThrow();
    expect((await json('GET', 'admin/audit/verify')).valid).toBe(true);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../api/main';
import { Database } from '../api/core';
import { seed } from '../api/setup';
import { prepareManualWorkspace } from '../api/manual-workspace';
import { classifyWithQuery, RulesController } from '../api/registry-rules';

describe('Preenchimento manual em base vazia', () => {
  let app: Awaited<ReturnType<typeof createApplication>>, db: Database, base: string;
  const cookies: Record<string, string> = {};
  async function request(route: string, body?: unknown, role = 'requerente') {
    const response = await fetch(base + '/api/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: 'http://localhost:3400',
        'Content-Type': 'application/json',
        Cookie: cookies[role] || '',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  beforeAll(async () => {
    app = await createApplication();
    db = app.get(Database);
    await db.migrate();
    await seed(db, 'Manual-Integration-2026!');
    await prepareManualWorkspace(db);
    await app.listen(0, '127.0.0.1');
    base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
    for (const slug of ['admin', 'requerente', 'protocolo', 'tecnico']) {
      const r = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3400', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: slug + '@demo.sislam.test',
          password: 'Manual-Integration-2026!',
        }),
      });
      expect(r.status).toBe(201);
      cookies[slug] = r.headers.get('set-cookie')!.split(';')[0];
      await r.arrayBuffer();
    }
  });
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });
  it('começa sem empresas, processos, regras ou nomes de pessoas inventados e não repovoa ao reiniciar', async () => {
    expect((await request('registry')).data).toEqual({ organizations: [], establishments: [] });
    expect((await request('cases')).data).toEqual([]);
    expect((await request('rules')).data).toEqual([]);
    expect((await request('dashboard')).data.counts.processes).toBe(0);
    expect((await request('auth/me')).data.user.name).toBe('Requerente');
    expect((await seed(db, 'Outra-Senha-Que-Nao-Deve-Ser-Aplicada!')).created).toBe(false);
    expect((await prepareManualWorkspace(db)).changed).toBe(false);
  });
  it('cadastra atividade livre, medidas e documentos manualmente sem presumir regra ou competência', async () => {
    const org = await request('registry/organizations', {
      name: 'Organização inserida manualmente',
      registration: 'MANUAL-2026',
      representative: 'Responsável informado',
      email: '',
      phone: '',
    });
    expect(org.status).toBe(201);
    const input = {
      organizationId: org.data.id,
      name: 'Unidade cadastrada manualmente',
      activity: 'ATIVIDADE-INFORMADA',
      address: 'Endereço informado durante o teste',
      capacity: 42.5,
      capacityUnit: 'toneladas/mês',
      area: 123.45,
      latitude: null,
      longitude: null,
    };
    expect((await request('registry/establishments', { ...input, latitude: -12 })).status).toBe(
      400,
    );
    const site = await request('registry/establishments', input);
    expect(site.status).toBe(201);
    expect(site.data.capacity_unit).toBe('toneladas/mês');
    expect(Number(site.data.capacity)).toBe(42.5);
    const created = await request('cases', {
      establishmentId: site.data.id,
      title: 'Pedido preenchido manualmente',
    });
    expect(created.status).toBe(201);
    async function advance(role: string, action = 'complete', extra = {}) {
      const detail = (await request('cases/' + created.data.id, undefined, role)).data;
      const r = await request(
        'cases/' + created.data.id + '/workflow',
        {
          step: detail.workflow_step,
          revision: detail.revision,
          action,
          note: 'Conferência registrada manualmente no teste de integração.',
          ...extra,
        },
        role,
      );
      expect(r.status).toBe(201);
    }
    await advance('requerente');
    await advance('protocolo');
    let detail = (await request('cases/' + created.data.id)).data;
    expect(detail.classification.manual).toBe(true);
    expect(detail.classification.requirements).toEqual([]);
    expect(detail.rule_snapshot).toBeNull();
    await advance('tecnico');
    await advance('tecnico', 'municipal', {
      reference: 'Referência informada para conferência da competência neste teste.',
    });
    const revision = await request(
      'cases/' + created.data.id + '/classification',
      {
        label: 'Porte informado na análise',
        potential: 'médio',
        modality: 'Procedimento informado',
        source: 'Referência técnica cadastrada pelo analista',
        reason:
          'A atividade não possui regra e exige avaliação manual dos documentos e das medidas informadas.',
        requirements: [{ key: 'estudo', name: 'Estudo informado pelo analista', kind: 'required' }],
      },
      'tecnico',
    );
    expect(revision.status).toBe(201);
    await advance('tecnico');
    await advance('tecnico');
    detail = (await request('cases/' + created.data.id, undefined, 'tecnico')).data;
    expect(detail.workflow_step).toBe('7');
    expect(detail.rule_snapshot).toBeNull();
    expect(detail.checklist[0].name).toBe('Estudo informado pelo analista');
    expect(
      (
        await request(
          'cases/' + created.data.id + '/classification',
          {
            label: 'Tentativa',
            potential: 'baixo',
            modality: 'Tentativa',
            source: 'Referência de teste',
            reason: 'Tentativa do requerente de alterar documentos técnicos.',
            requirements: [],
          },
          'requerente',
        )
      ).status,
    ).toBe(403);
  });
});

describe('Retirada dos exemplos preservando originais e isolamento', () => {
  it('arquiva apenas o cenário reconhecido, preserva um cadastro manual e os hashes anteriores', async () => {
    const db = new Database();
    await db.migrate();
    try {
      const fixture: any = await seed(db, 'Archive-Integration-2026!', { samples: true });
      const original = await db.system(async (q) => ({
        documents: (await q.query('SELECT id,sha256,storage_key FROM documents ORDER BY id')).rows,
        rules: (await q.query('SELECT id,definition FROM rule_versions ORDER BY id')).rows,
        audits: (await q.query('SELECT event_hash FROM audit_events ORDER BY sequence')).rows,
      }));
      const kept = await db.tenant(
        fixture.actors.requerente,
        async (q) =>
          (
            await q.query(
              'INSERT INTO organizations(municipality_id,owner_id,name,registration,representative) VALUES($1,$2,$3,$4,$5) RETURNING id',
              [
                fixture.municipality.id,
                fixture.actors.requerente.id,
                'Empresa manual (fictícia no teste)',
                'MANUAL-PRESERVAR',
                'Responsável informado',
              ],
            )
          ).rows[0],
      );
      expect((await prepareManualWorkspace(db)).changed).toBe(true);
      const visible = await db.tenant(fixture.actors.admin, async (q) => ({
        orgs: (await q.query('SELECT id FROM organizations')).rows,
        cases: (await q.query('SELECT id FROM cases')).rows,
        rules: (await q.query('SELECT id FROM rule_versions')).rows,
        documents: (await q.query('SELECT id FROM documents')).rows,
        complaints: (await q.query('SELECT id FROM complaints')).rows,
        inspections: (await q.query('SELECT id FROM inspections')).rows,
      }));
      expect(visible).toEqual({
        orgs: [kept],
        cases: [],
        rules: [],
        documents: [],
        complaints: [],
        inspections: [],
      });
      await db.system(async (q) => {
        expect(
          (await q.query('SELECT id,sha256,storage_key FROM documents ORDER BY id')).rows,
        ).toEqual(original.documents);
        expect((await q.query('SELECT id,definition FROM rule_versions ORDER BY id')).rows).toEqual(
          original.rules,
        );
        const audit = (
          await q.query('SELECT event_hash FROM audit_events WHERE action<>$1 ORDER BY sequence', [
            'workspace.manual_initialized',
          ])
        ).rows;
        expect(audit).toEqual(original.audits);
      });
      const other = { ...fixture.actors.admin, municipalityId: fixture.other.id };
      expect(
        await db.tenant(other, async (q) => (await q.query('SELECT id FROM organizations')).rows),
      ).toEqual([]);
      expect((await prepareManualWorkspace(db)).changed).toBe(false);
      await db.tenant(fixture.actors.admin, async (q) => {
        const ruleResult = await classifyWithQuery(
          q,
          'DEMO-MADEIRA',
          10,
          '2026-11-24',
          'toneladas/mês',
        );
        expect(ruleResult.result.manual).toBe(true);
      });
      const rule = await new RulesController(db).create({ actor: fixture.actors.admin } as any, {
        activity: 'DEMO-MADEIRA',
        title: 'Nova regra informada pelo responsável',
        status: 'approved_demo',
        validFrom: '2026-01-01',
        sourceReference: 'Referência digitada na verificação isolada, sem validade normativa.',
        definition: { ...original.rules[0].definition, unit: 'toneladas/mês' },
      });
      expect(rule.version).toBe(2);
      await db.tenant(fixture.actors.admin, async (q) => {
        const differentUnit = await classifyWithQuery(
          q,
          'DEMO-MADEIRA',
          10,
          '2026-11-24',
          'm³/dia',
        );
        expect(differentUnit.result.manual).toBe(true);
        expect(differentUnit.result.reason).toContain('unidade');
        expect(differentUnit.snapshot?.id).toBe(rule.id);
      });
      await expect(
        db.tenant(fixture.actors.admin, (q) => q.query('DELETE FROM archived_samples')),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await db.close();
    }
  });
});

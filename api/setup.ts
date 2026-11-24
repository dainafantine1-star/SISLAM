import { loadEnvironment } from './config';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Database, passwordHash, type Actor, audit, DEMO, dataDirectory } from './core';
import { FileStore } from './documents';
import { CasesService } from './cases';
import { DocumentsService } from './documents';
import { digest } from './core';
import { municipalWorkflow } from './municipal-workflow';
export const profiles = [
  ['admin', 'Marina Santos', 'municipal_admin'],
  ['protocolo', 'Clara Nunes', 'protocol'],
  ['tecnico', 'Rafael Oliveira', 'analyst'],
  ['autoridade', 'Helena Almeida', 'authority'],
  ['requerente', 'João Araújo', 'applicant'],
  ['fiscal', 'Pedro Costa', 'inspector'],
  ['ouvidoria', 'Camila Rocha', 'ombudsman'],
  ['fornecedor', 'Suporte SISLAM', 'supplier'],
] as const;
export async function seed(db: Database, password: string) {
  const existing = await db.system(
    async (q) => (await q.query('SELECT id FROM municipalities LIMIT 1')).rows[0],
  );
  if (existing) return { created: false };
  const data = await db.system(async (q) => {
    const municipality = (
        await q.query(
          "INSERT INTO municipalities(code,name,state) VALUES('ITABERABA-DEMO','Itaberaba','BA') RETURNING *",
        )
      ).rows[0],
      other = (
        await q.query(
          "INSERT INTO municipalities(code,name,state) VALUES('HOMOLOGACAO','Município de Homologação','BA') RETURNING *",
        )
      ).rows[0];
    const actors: Record<string, Actor> = {};
    for (const [slug, name, role] of profiles) {
      const user = (
        await q.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING *', [
          `${slug}@demo.sislam.test`,
          name,
          passwordHash(password),
        ])
      ).rows[0];
      await q.query('INSERT INTO memberships(municipality_id,user_id,role) VALUES($1,$2,$3)', [
        municipality.id,
        user.id,
        role,
      ]);
      actors[slug] = {
        id: user.id,
        name,
        email: user.email,
        role,
        municipalityId: municipality.id,
        mfa: false,
        session: 'seed',
      };
    }
    await q.query(
      "INSERT INTO memberships(municipality_id,user_id,role) VALUES($1,$2,'municipal_admin')",
      [other.id, actors.admin.id],
    );
    const definition = {
      unit: 'unidades/mês (cenário fictício)',
      bands: [
        {
          max: 100,
          label: 'Pequeno porte demonstrativo',
          potential: 'baixo',
          modality: 'Licença-modelo simplificada',
        },
        {
          max: 1000,
          label: 'Médio porte demonstrativo',
          potential: 'médio',
          modality: 'Licença-modelo com análise técnica',
        },
      ],
      documents: [
        { key: 'cadastro', name: 'Ficha cadastral do requerente', kind: 'required' },
        { key: 'memorial', name: 'Memorial descritivo da atividade', kind: 'required' },
        { key: 'planta', name: 'Planta de localização', kind: 'required' },
      ],
      note: 'Faixas e documentos exclusivamente para demonstração. Não representam exigências legais validadas.',
    };
    const rule = (
      await q.query(
        "INSERT INTO rule_versions(municipality_id,activity,version,title,status,valid_from,definition,source_reference,created_by,approved_by) VALUES($1,'DEMO-MADEIRA',1,'Atividade de transformação — cenário demonstrativo','approved_demo','2020-01-01',$2,$3,$4,$4) RETURNING *",
        [
          municipality.id,
          JSON.stringify(definition),
          'DEMO-001 • Exemplo de engenharia, sem fundamento normativo homologado.',
          actors.admin.id,
        ],
      )
    ).rows[0];
    const sampleNames = [
      'Madeireira Serra Verde',
      'Cooperativa Vale do Paraguaçu',
      'Cerâmica Nova Terra',
      'Oficina Raízes do Sertão',
      'Agroindústria Boa Vista',
      'Centro de Reciclagem Horizonte',
      'Marcenaria Ipê',
      'Sítio Lagoa Clara',
    ];
    const caseIds: string[] = [];
    for (let i = 0; i < sampleNames.length; i++) {
      const name = sampleNames[i] + ' (fictícia)',
        org = (
          await q.query(
            'INSERT INTO organizations(municipality_id,owner_id,name,registration,representative,email,phone) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [
              municipality.id,
              actors.requerente.id,
              name,
              'DEMO-' + String(i + 1).padStart(4, '0'),
              'Responsável demonstrativo',
              'contato@exemplo.test',
              '(75) 0000-0000',
            ],
          )
        ).rows[0];
      const establishment = (
        await q.query(
          'INSERT INTO establishments(municipality_id,organization_id,name,activity,address,latitude,longitude,capacity,area) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
          [
            municipality.id,
            org.id,
            name,
            'DEMO-MADEIRA',
            'Endereço fictício — zona urbana de Itaberaba / BA',
            -12.524,
            -40.306,
            80 + i * 30,
            200 + i * 100,
          ],
        )
      ).rows[0];
      const status = [
        'requirements',
        'analysis',
        'screening',
        'filed',
        'analysis',
        'draft',
        'screening',
        'draft',
      ][i];
      const c = (
        await q.query(
          "INSERT INTO cases(municipality_id,establishment_id,owner_id,assigned_to,title,status,protocol,rule_id,rule_snapshot,classification,filed_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()-($12::int*interval '1 day'),now()-($13::int*interval '1 hour')) RETURNING *",
          [
            municipality.id,
            establishment.id,
            actors.requerente.id,
            i % 2 ? actors.tecnico.id : null,
            'Requerimento de licença ambiental — ' + sampleNames[i],
            status,
            status === 'draft'
              ? null
              : `SIS-${new Date().getUTCFullYear()}-${String(124 + i).padStart(6, '0')}`,
            status === 'draft' ? null : rule.id,
            status === 'draft' ? null : JSON.stringify(rule),
            status === 'draft'
              ? null
              : JSON.stringify({
                  manual: false,
                  demonstration: true,
                  label: i === 0 ? 'Pequeno porte demonstrativo' : 'Médio porte demonstrativo',
                  potential: i === 0 ? 'baixo' : 'médio',
                  modality:
                    i === 0 ? 'Licença-modelo simplificada' : 'Licença-modelo com análise técnica',
                  ruleId: rule.id,
                  ruleVersion: 1,
                  source: rule.source_reference,
                  requirements: definition.documents,
                  competence: 'Competência a confirmar pelo órgão',
                }),
            status === 'draft' ? null : new Date(Date.now() - (i + 2) * 86400000),
            i + 2,
            i * 3,
          ],
        )
      ).rows[0];
      caseIds.push(c.id);
    }
    const otherOrg = (
      await q.query(
        'INSERT INTO organizations(municipality_id,owner_id,name,registration,representative) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [
          other.id,
          actors.admin.id,
          'Empresa isolada da homologação',
          'HOMO-001',
          'Responsável fictício',
        ],
      )
    ).rows[0];
    return { municipality, other, actors, caseIds, otherOrg };
  });
  await completeDemoAssets(db, {
    municipality: { id: String(data.municipality.id) },
    actors: data.actors,
    caseIds: data.caseIds,
  });
  return { created: true, ...data };
}

type DemoSeed = { municipality: { id: string }; actors: Record<string, Actor>; caseIds: string[] };

// Resume only the known fictional fixture. Existing originals and events stay intact.
export async function resumeDemoSetup(db: Database) {
  if (!DEMO()) throw new Error('A preparação de exemplos exige modo demonstrativo');
  const data = await db.system(async (q) => {
    const municipality = (
      await q.query("SELECT id FROM municipalities WHERE code='ITABERABA-DEMO'")
    ).rows[0];
    if (!municipality) throw new Error('Município demonstrativo não encontrado');
    const actors: Record<string, Actor> = {};
    for (const [slug] of profiles) {
      const user = (
        await q.query(
          'SELECT u.id,u.name,u.email,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=$1 AND m.municipality_id=$2',
          [slug + '@demo.sislam.test', municipality.id],
        )
      ).rows[0];
      if (!user) throw new Error('Perfil demonstrativo não encontrado');
      actors[slug] = {
        ...user,
        municipalityId: municipality.id,
        mfa: false,
        session: 'seed',
      } as Actor;
    }
    const cases = (
      await q.query(
        "SELECT c.id FROM cases c JOIN establishments e ON e.id=c.establishment_id AND e.municipality_id=c.municipality_id JOIN organizations o ON o.id=e.organization_id AND o.municipality_id=e.municipality_id WHERE c.municipality_id=$1 AND c.owner_id=$2 AND o.registration=ANY($3) AND c.title='Requerimento de licença ambiental — ' || replace(e.name,' (fictícia)','') ORDER BY o.registration",
        [
          municipality.id,
          actors.requerente.id,
          Array.from({ length: 8 }, (_, i) => 'DEMO-' + String(i + 1).padStart(4, '0')),
        ],
      )
    ).rows;
    if (cases.length !== 8)
      throw new Error('Cenário demonstrativo não reconhecido; base preservada');
    return {
      municipality: { id: String(municipality.id) },
      actors,
      caseIds: cases.map((c) => String(c.id)),
    };
  });
  await completeDemoAssets(db, data);
}

async function completeDemoAssets(db: Database, data: DemoSeed) {
  const files = new FileStore(),
    documents = new DocumentsService(db, files);
  const pdf = await PDFDocument.create(),
    page = pdf.addPage(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('SISLAM - DOCUMENTO FICTICIO PARA DEMONSTRACAO', { x: 45, y: 760, size: 14, font });
  page.drawText('Sem validade juridica. Conteudo de exemplo.', { x: 45, y: 730, size: 11, font });
  const buffer = Buffer.from(await pdf.save());
  for (const requirementKey of ['cadastro', 'memorial']) {
    const exists = await db.tenant(
      data.actors.requerente,
      async (q) =>
        (
          await q.query(
            'SELECT id FROM documents WHERE case_id=$1 AND requirement_key=$2 LIMIT 1',
            [data.caseIds[0], requirementKey],
          )
        ).rows.length > 0,
    );
    if (exists) continue;
    await documents.upload(data.actors.requerente, data.caseIds[0], requirementKey, {
      buffer,
      originalname: requirementKey + '-demonstracao.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
    } as Express.Multer.File);
  }
  for (const caseId of data.caseIds)
    await db.tenant(data.actors.admin, async (q) => {
      const exists =
        (
          await q.query(
            "SELECT id FROM audit_events WHERE case_id=$1 AND action='demo.case_initialized' LIMIT 1",
            [caseId],
          )
        ).rows.length > 0;
      if (!exists)
        await audit(q, data.actors.admin, 'demo.case_initialized', { synthetic: true }, caseId);
    });
  await db.tenant(data.actors.ouvidoria, async (q) => {
    if ((await q.query("SELECT id FROM complaints WHERE protocol='DEN-DEMO-0001'")).rows.length)
      return;
    await q.query(
      "INSERT INTO complaints(municipality_id,protocol,title,narrative,location,created_by) VALUES($1,'DEN-DEMO-0001','Descarte irregular — exemplo','Relato inteiramente fictício para demonstrar o encaminhamento à fiscalização.','Localização demonstrativa: bairro fictício', $2)",
      [data.municipality.id, data.actors.ouvidoria.id],
    );
    await audit(q, data.actors.ouvidoria, 'demo.complaint_initialized', { synthetic: true });
  });
  await db.tenant(data.actors.fiscal, async (q) => {
    if (
      (
        await q.query('SELECT id FROM inspections WHERE case_id=$1 AND title=$2', [
          data.caseIds[1],
          'Vistoria inicial — cenário demonstrativo',
        ])
      ).rows.length
    )
      return;
    await q.query(
      'INSERT INTO inspections(municipality_id,case_id,inspector_id,title,scheduled_at) VALUES($1,$2,$3,$4,$5)',
      [
        data.municipality.id,
        data.caseIds[1],
        data.actors.fiscal.id,
        'Vistoria inicial — cenário demonstrativo',
        new Date(Date.now() + 2 * 86400000),
      ],
    );
    await audit(
      q,
      data.actors.fiscal,
      'demo.inspection_initialized',
      { synthetic: true },
      data.caseIds[1],
    );
  });
}
async function main() {
  if (!fs.existsSync('.env')) {
    const secret = randomBytes(48).toString('base64url');
    fs.writeFileSync(
      '.env',
      `SISLAM_DEMO=1\nPORT=3401\nWEB_ORIGIN=http://localhost:3400\nAPI_INTERNAL_URL=http://127.0.0.1:3401\nDATA_DIR=./runtime\nDATABASE_URL=\nS3_ENDPOINT=\nS3_BUCKET=\nS3_ACCESS_KEY_ID=\nS3_SECRET_ACCESS_KEY=\nANTIVIRUS_URL=\nAPP_ENCRYPTION_KEY=${secret}\n`,
      { flag: 'wx' },
    );
    process.env.SISLAM_DEMO = '1';
    process.env.APP_ENCRYPTION_KEY = secret;
  }
  loadEnvironment();
  if (!DEMO()) throw Error('O setup de dados fictícios exige SISLAM_DEMO=1');
  const db = new Database();
  try {
    await db.migrate();
    const password = 'Sislam-' + randomBytes(9).toString('base64url') + '!';
    const result = await seed(db, password);
    await ensureWorkflowDemo(db);
    if (result.created) {
      fs.writeFileSync(
        'ACESSO-LOCAL.txt',
        `SISLAM — DEMONSTRAÇÃO LOCAL\r\n\r\nEndereço: http://localhost:3400\r\nSenha dos perfis fictícios: ${password}\r\n\r\n${profiles.map(([slug, name, role]) => `${slug}@demo.sislam.test — ${name} — ${role}`).join('\r\n')}\r\n\r\nOs dados são fictícios. Nenhum ato possui validade jurídica.\r\nO fornecedor só entra após autorização temporária do admin municipal.\r\nGuarde este arquivo localmente; não publique .env, runtime ou senhas.\r\n`,
        { flag: 'wx' },
      );
      console.log('SISLAM preparado. Consulte ACESSO-LOCAL.txt para entrar.');
    } else console.log('SISLAM: base existente preservada.');
  } finally {
    await db.close();
  }
}
// Add a separate, identifiable fictional example; never replace existing cases or credentials.
export async function ensureWorkflowDemo(db: Database) {
  if (!DEMO()) throw new Error('O exemplo do fluxograma exige modo demonstrativo.');
  const actor = await db.system(
    async (q) =>
      (
        await q.query(
          "SELECT u.id,u.email,u.name,m.role,m.municipality_id AS \"municipalityId\" FROM users u JOIN memberships m ON m.user_id=u.id JOIN municipalities c ON c.id=m.municipality_id WHERE u.email='requerente@demo.sislam.test' AND c.code='ITABERABA-DEMO' AND m.role='applicant' AND m.active AND u.active",
        )
      ).rows[0],
  );
  if (!actor) return;
  await db.tenant({ ...actor, mfa: false, session: 'seed' } as Actor, async (q) => {
    const title = 'Demonstração do fluxograma municipal — 25 etapas';
    if ((await q.query('SELECT id FROM cases WHERE title=$1', [title])).rows.length) return;
    let organization = (
      await q.query("SELECT id FROM organizations WHERE registration='DEMO-FLUXO-25'")
    ).rows[0];
    if (!organization)
      organization = (
        await q.query(
          'INSERT INTO organizations(municipality_id,owner_id,name,registration,representative) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [
            actor.municipalityId,
            actor.id,
            'Empresa Roteiro Municipal (fictícia)',
            'DEMO-FLUXO-25',
            'Responsável demonstrativo',
          ],
        )
      ).rows[0];
    let establishment = (
      await q.query('SELECT id FROM establishments WHERE organization_id=$1', [organization.id])
    ).rows[0];
    if (!establishment)
      establishment = (
        await q.query(
          'INSERT INTO establishments(municipality_id,organization_id,name,activity,address,capacity,area) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [
            actor.municipalityId,
            organization.id,
            'Empresa Roteiro Municipal (fictícia)',
            'DEMO-MADEIRA',
            'Endereço fictício em Itaberaba',
            50,
            100,
          ],
        )
      ).rows[0];
    const process = (
      await q.query(
        "INSERT INTO cases(municipality_id,establishment_id,owner_id,title,workflow_step,workflow_snapshot) VALUES($1,$2,$3,$4,'1',$5) RETURNING id",
        [
          actor.municipalityId,
          establishment.id,
          actor.id,
          title,
          JSON.stringify(municipalWorkflow),
        ],
      )
    ).rows[0];
    await audit(
      q,
      { ...actor, mfa: false, session: 'seed' } as Actor,
      'demo.workflow_initialized',
      { synthetic: true, version: municipalWorkflow.version },
      process.id,
    );
  });
}
if (!process.env.SISLAM_TEST && !process.env.VERCEL)
  main().catch((error) => {
    console.error('Setup:', error.code || error.message);
    process.exitCode = 1;
  });

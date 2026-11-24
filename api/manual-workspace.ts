import { Database, auditSystem, type Actor } from './core';

const samples = [
  ['DEMO-0001', 'Madeireira Serra Verde (fictícia)'],
  ['DEMO-0002', 'Cooperativa Vale do Paraguaçu (fictícia)'],
  ['DEMO-0003', 'Cerâmica Nova Terra (fictícia)'],
  ['DEMO-0004', 'Oficina Raízes do Sertão (fictícia)'],
  ['DEMO-0005', 'Agroindústria Boa Vista (fictícia)'],
  ['DEMO-0006', 'Centro de Reciclagem Horizonte (fictícia)'],
  ['DEMO-0007', 'Marcenaria Ipê (fictícia)'],
  ['DEMO-0008', 'Sítio Lagoa Clara (fictícia)'],
  ['DEMO-FLUXO-25', 'Empresa Roteiro Municipal (fictícia)'],
  ['HOMO-001', 'Empresa isolada da homologação'],
];
const profileNames = [
  ['admin', 'Marina Santos', 'Administração municipal'],
  ['protocolo', 'Clara Nunes', 'Departamento administrativo'],
  ['tecnico', 'Rafael Oliveira', 'Departamento técnico'],
  ['autoridade', 'Helena Almeida', 'Autoridade municipal'],
  ['requerente', 'João Araújo', 'Requerente'],
  ['fiscal', 'Pedro Costa', 'Fiscalização'],
  ['ouvidoria', 'Camila Rocha', 'Ouvidoria'],
];

/** One-time archival of the exact installed fixtures; never erase originals,
 * frozen rules, files or audit events, and never identify samples by substrings. */
export async function prepareManualWorkspace(db: Database) {
  return db.system(async (q) => {
    await q.query("SELECT pg_advisory_xact_lock(hashtext('sislam:manual-workspace'))");
    const municipality = (
      await q.query("SELECT id FROM municipalities WHERE code='ITABERABA-DEMO'")
    ).rows[0];
    if (!municipality) throw new Error('Município inicial não encontrado.');
    if (
      (
        await q.query('SELECT 1 FROM workspace_initializations WHERE municipality_id=$1', [
          municipality.id,
        ])
      ).rows.length
    )
      return { changed: false, archived: 0 };
    const admin = (
      await q.query(
        `SELECT u.id,u.email,u.name,m.role,m.municipality_id AS "municipalityId"
      FROM users u JOIN memberships m ON m.user_id=u.id
      WHERE u.email='admin@demo.sislam.test' AND m.municipality_id=$1 AND m.role='municipal_admin' AND m.active AND u.active`,
        [municipality.id],
      )
    ).rows[0];
    if (!admin) throw new Error('Administrador inicial não encontrado.');
    const reason =
      'Exemplo instalado retirado das telas para início do preenchimento manual, a pedido do responsável.';
    const archive = async (table: string, where: string, params: unknown[] = []) => {
      await q.query(
        `INSERT INTO archived_samples(municipality_id,entity_type,entity_id,reason)
        SELECT t.municipality_id,'${table}',t.id,$1 FROM ${table} t WHERE ${where}
        ON CONFLICT DO NOTHING`,
        [reason, ...params],
      );
    };
    for (const [registration, name] of samples)
      await archive(
        'organizations',
        `t.registration=$2 AND t.name=$3 AND t.municipality_id IN (SELECT id FROM municipalities WHERE code IN ('ITABERABA-DEMO','HOMOLOGACAO'))`,
        [registration, name],
      );
    const archived = (table: string, column: string) =>
      `EXISTS (SELECT 1 FROM archived_samples s WHERE s.municipality_id=t.municipality_id AND s.entity_type='${table}' AND s.entity_id=t.${column})`;
    await archive('establishments', archived('organizations', 'organization_id'));
    await archive('cases', archived('establishments', 'establishment_id'));
    await archive(
      'rule_versions',
      `t.activity='DEMO-MADEIRA' AND t.version=1 AND t.title='Atividade de transformação — cenário demonstrativo' AND t.source_reference='DEMO-001 • Exemplo de engenharia, sem fundamento normativo homologado.' AND t.municipality_id=$2`,
      [municipality.id],
    );
    await archive(
      'complaints',
      `t.protocol='DEN-DEMO-0001' AND t.title='Descarte irregular — exemplo' AND t.municipality_id=$2`,
      [municipality.id],
    );
    for (const table of ['documents', 'opinions', 'licenses', 'conditions', 'notices'])
      await archive(table, archived('cases', 'case_id'));
    await archive(
      'inspections',
      `${archived('cases', 'case_id')} OR ${archived('complaints', 'complaint_id')}`,
    );
    await archive('complaint_contacts', archived('complaints', 'complaint_id'));
    for (const [slug, oldName, name] of profileNames)
      await q.query('UPDATE users SET name=$1 WHERE email=$2 AND name=$3', [
        name,
        slug + '@demo.sislam.test',
        oldName,
      ]);
    // The secondary municipality exists solely to verify isolation in test fixtures.
    await q.query(
      `UPDATE memberships SET active=false WHERE user_id=$1 AND municipality_id IN (SELECT id FROM municipalities WHERE code='HOMOLOGACAO')`,
      [admin.id],
    );
    await q.query(
      "INSERT INTO workspace_initializations(municipality_id,mode) VALUES($1,'manual')",
      [municipality.id],
    );
    const count = Number(
      (await q.query('SELECT count(*)::int AS n FROM archived_samples')).rows[0].n,
    );
    await auditSystem(
      q,
      { ...admin, mfa: false, session: 'manual-workspace-setup' } as Actor,
      'workspace.manual_initialized',
      {
        archivedSamples: count,
        originalsPreserved: true,
        credentialsChanged: false,
      },
    );
    return { changed: true, archived: count };
  });
}

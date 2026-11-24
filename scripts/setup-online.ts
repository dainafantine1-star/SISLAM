// Deliberate one-time setup, never imported by a request.
import { config } from 'dotenv';

async function main() {
  const envFile = process.argv[2];
  if (envFile !== '--environment') {
    if (!envFile) throw new Error('Informe um arquivo privado ou --environment');
    config({ path: envFile, override: true, quiet: true });
  }
  if (
    process.env.SISLAM_DEMO !== '1' ||
    !process.env.VERCEL ||
    !process.env.DATABASE_URL ||
    (process.env.APP_ENCRYPTION_KEY?.length || 0) < 32 ||
    (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID && !process.env.S3_BUCKET)
  )
    throw new Error(
      'Configure demonstração, PostgreSQL, chave de cifragem e armazenamento persistente',
    );
  const origin = new URL(process.env.WEB_ORIGIN || '');
  if (origin.protocol !== 'https:') throw new Error('O ambiente online exige uma origem HTTPS');
  // Setup uses a direct connection; requests keep using the pooled URL.
  if (process.env.DATABASE_URL_UNPOOLED)
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
  const { Database } = await import('../api/core');
  const { seed } = await import('../api/setup');
  const { prepareManualWorkspace } = await import('../api/manual-workspace');
  const db = new Database();
  try {
    console.log('SISLAM online: aplicando migrações pendentes.');
    await db.migrate();
    console.log('SISLAM online: preparando o preenchimento manual.');
    const exists = await db.system(
      async (q) => (await q.query('SELECT id FROM municipalities LIMIT 1')).rows.length > 0,
    );
    if (exists) {
      const actor = await db.system(
        async (q) =>
          (
            await q.query(
              "SELECT u.id,m.municipality_id AS \"municipalityId\",u.name,u.email,m.role,false AS mfa,'setup-check' AS session FROM users u JOIN memberships m ON m.user_id=u.id JOIN municipalities c ON c.id=m.municipality_id WHERE u.email='admin@demo.sislam.test' AND c.code='ITABERABA-DEMO'",
            )
          ).rows[0],
      );
      if (actor)
        await db.tenant(actor as import('../api/core').Actor, async (q) => {
          await q.query('SELECT count(*) FROM organizations');
        });
      await prepareManualWorkspace(db);
      console.log('SISLAM online: exemplos arquivados; cadastros manuais e credenciais preservados.');
      return;
    }
    const password = process.env.SISLAM_DEMO_PASSWORD;
    if (!password || password.length < 20)
      throw new Error('Configure uma senha aleatória para a preparação da demonstração');
    await seed(db, password);
    await prepareManualWorkspace(db);
    console.log('SISLAM online preparado. Consulte ACESSO-ONLINE.txt; a senha não foi exibida.');
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  const message = String(error?.message || '').replace(/postgres(?:ql)?:\/\/\S+/gi, '[redigido]');
  console.error('Setup online:', error?.code || error?.name || 'Erro', message);
  process.exitCode = 1;
});

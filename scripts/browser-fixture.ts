import fs from 'node:fs';
import path from 'node:path';
import { createApplication } from '../api/main';
import { Database } from '../api/core';
import { seed, ensureWorkflowDemo } from '../api/setup';
import { capture, verifyBackup, encodeBackup, decodeBackup } from '../api/backup';
import { FileStore } from '../api/documents';
import { prepareManualWorkspace } from '../api/manual-workspace';

async function main() {
  if (process.env.SISLAM_TEST !== '1' || !process.env.SISLAM_BROWSER_PASSWORD)
    throw new Error('A fixture exige ambiente de teste isolado');
  console.log('Preparando banco fictício isolado...');
  const app = await createApplication();
  const db = app.get(Database);
  await db.migrate();
  console.log('Migrações da fixture concluídas; preparando os exemplos...');
  const manual = process.env.SISLAM_BROWSER_MANUAL === '1';
  await seed(db, process.env.SISLAM_BROWSER_PASSWORD, { samples: !manual });
  if (manual) await prepareManualWorkspace(db);
  else await ensureWorkflowDemo(db);
  fs.writeFileSync(
    process.env.SISLAM_BROWSER_ACCESS_FILE!,
    `Senha dos perfis fictícios: ${process.env.SISLAM_BROWSER_PASSWORD}\n`,
    { flag: 'wx' },
  );
  await app.listen(3401, '127.0.0.1');
  console.log('Fixture isolada pronta');
  process.on('message', async (message) => {
    if (message !== 'verify-backup') return;
    try {
      const result = await verifyBackup(
        decodeBackup(encodeBackup(await capture(db, new FileStore()))),
      );
      fs.writeFileSync(
        path.resolve('test-results/backup-browser.json'),
        JSON.stringify(result, null, 2),
      );
      process.send?.({ backup: result });
    } catch (error) {
      process.send?.({ error: error instanceof Error ? error.message : 'Falha no backup' });
    }
  });
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

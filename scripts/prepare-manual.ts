import '../api/config';
import { Database, DEMO } from '../api/core';
import { prepareManualWorkspace } from '../api/manual-workspace';
async function main() {
  if (!DEMO()) throw new Error('A preparação exige ambiente de demonstração.');
  const db = new Database();
  try {
    await db.migrate();
    console.log(JSON.stringify(await prepareManualWorkspace(db)));
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error('Preparação manual:', error.code || error.name || 'Erro');
  process.exitCode = 1;
});

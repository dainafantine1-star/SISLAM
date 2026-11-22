import '../api/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Database, dataDirectory, encrypt } from '../api/core';
import { decodeBackup, restoreInto, verifyBackup } from '../api/backup';
async function main() {
  const [file, target] = process.argv.slice(2);
  if (!file || !target) throw Error('Uso: npm run restore -- arquivo.sislam pasta-nova');
  const destination = path.resolve(target);
  if (destination === dataDirectory())
    throw Error('A restauração exige uma pasta nova, sem substituir a base atual');
  try {
    await fs.access(destination);
    throw Error('O destino já existe. Escolha uma pasta nova.');
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
  const snapshot = decodeBackup(await fs.readFile(file));
  await verifyBackup(snapshot);
  await fs.mkdir(destination, { recursive: false });
  const db = new PGlite(path.join(destination, 'database'));
  try {
    const { readdirSync, readFileSync } = await import('node:fs');
    await db.exec(
      readdirSync('db')
        .filter((f) => /^\d+.*\.sql$/.test(f))
        .sort()
        .map((f) => readFileSync(path.join('db', f), 'utf8'))
        .join('\n'),
    );
    await db.exec(
      'CREATE TABLE schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()); BEGIN',
    );
    await restoreInto(db as any, snapshot);
    await db.exec('COMMIT');
    await fs.mkdir(path.join(destination, 'files'));
    for (const file of snapshot.files)
      await fs.writeFile(
        path.join(destination, 'files', file.key),
        encrypt(Buffer.from(file.content, 'base64')),
        { flag: 'wx' },
      );
    console.log(
      JSON.stringify({
        restored: true,
        directory: destination,
        tables: snapshot.tables.length,
        files: snapshot.files.length,
        instruction:
          'Preserve APP_ENCRYPTION_KEY e configure DATA_DIR para este destino, com os serviços parados.',
      }),
    );
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

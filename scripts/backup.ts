import '../api/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Database, dataDirectory } from '../api/core';
import { FileStore } from '../api/documents';
import { capture, encodeBackup, decodeBackup, verifyBackup } from '../api/backup';
async function main() {
  const db = new Database();
  try {
    const snapshot = await capture(db, new FileStore()),
      encoded = encodeBackup(snapshot);
    const directory = path.join(dataDirectory(), 'backups');
    await fs.mkdir(directory, { recursive: true });
    const file = path.join(
      directory,
      'sislam-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sislam',
    );
    await fs.writeFile(file, encoded, { flag: 'wx' });
    const verified = await verifyBackup(decodeBackup(await fs.readFile(file)));
    console.log(JSON.stringify({ file, ...verified, encrypted: true }));
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

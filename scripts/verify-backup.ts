import '../api/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { dataDirectory } from '../api/core';
import { decodeBackup, verifyBackup } from '../api/backup';
async function main() {
  const directory = path.join(dataDirectory(), 'backups'),
    file =
      process.argv[2] ||
      path.join(
        directory,
        (await fs.readdir(directory))
          .filter((f) => f.endsWith('.sislam'))
          .sort()
          .at(-1) || '',
      );
  console.log(JSON.stringify(await verifyBackup(decodeBackup(await fs.readFile(file)))));
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

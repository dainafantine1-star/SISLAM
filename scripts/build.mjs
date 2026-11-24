import { spawnSync } from 'node:child_process';
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
// Explicit build-only flag for initializing a new, empty demonstration database.
// Routine builds never run migrations or generate demonstration data.
if (process.env.SISLAM_INITIALIZE_DEMO === '1') {
  if (!process.env.VERCEL) throw new Error('A preparação online deve executar na Vercel');
  run(['node_modules/tsx/dist/cli.mjs', 'scripts/setup-online.ts', '--environment']);
}
run(['node_modules/next/dist/bin/next', 'build', '--webpack']);

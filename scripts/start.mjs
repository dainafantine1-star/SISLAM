import { config } from 'dotenv';
config({ override: true, quiet: true });
import { spawn, spawnSync, execFile } from 'node:child_process';
import fs from 'node:fs';
const production = process.argv.includes('--production');
const setup = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'api/setup.ts'], {
  stdio: 'inherit',
  windowsHide: true,
});
if (setup.status !== 0) process.exit(setup.status || 1);
// Setup may have created the local .env on first launch.
config({ override: true, quiet: true });
const children = [
  spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'api/main.ts'], {
    stdio: 'inherit',
    windowsHide: true,
    env: process.env,
  }),
  spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      production ? 'start' : 'dev',
      ...(production ? [] : ['--webpack']),
      '-p',
      '3400',
      '-H',
      '127.0.0.1',
    ],
    { stdio: 'inherit', windowsHide: true, env: process.env },
  ),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children)
    if (child.pid) {
      if (process.platform === 'win32')
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      else child.kill('SIGTERM');
    }
  process.exit();
}
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, stop);
for (const child of children)
  child.on('exit', (code) => {
    if (!stopping) {
      console.error('Um serviço foi encerrado:', code);
      stop();
    }
  });
if (process.argv.includes('--open')) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const [web, api] = await Promise.all([
        fetch('http://127.0.0.1:3400/login'),
        fetch('http://127.0.0.1:3401/api/auth/me'),
      ]);
      if (web.ok && api.status === 401) {
        if (process.platform === 'win32')
          execFile('rundll32.exe', ['url.dll,FileProtocolHandler', 'http://localhost:3400']);
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

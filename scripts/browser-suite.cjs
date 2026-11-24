const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const children = [];
fs.mkdirSync('runtime-tests', { recursive: true });
const directory = fs.mkdtempSync(path.resolve('runtime-tests/browser-'));
// Compile the isolated fixture without the tsx CLI's Windows account/IPC bootstrap.
// The application's regular typecheck remains responsible for type validation.
const ts = require('typescript');
for (const relative of [
  ...fs
    .readdirSync('api')
    .filter((name) => name.endsWith('.ts'))
    .map((name) => 'api/' + name),
  'scripts/browser-fixture.ts',
]) {
  const target = path.join(directory, 'compiled', relative.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const compiled = ts.transpileModule(fs.readFileSync(relative, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    fileName: relative,
  });
  fs.writeFileSync(target, compiled.outputText);
}
const workflowTarget = path.join(directory, 'compiled/src/lib/municipal-workflow.v1.json');
fs.mkdirSync(path.dirname(workflowTarget), { recursive: true });
fs.copyFileSync('src/lib/municipal-workflow.v1.json', workflowTarget);
const env = {
  ...process.env,
  SISLAM_TEST: '1',
  SISLAM_DEMO: '1',
  VERCEL: '',
  TEST_MEMORY: '',
  DATABASE_URL: '',
  S3_ENDPOINT: '',
  S3_BUCKET: '',
  S3_ACCESS_KEY_ID: '',
  S3_SECRET_ACCESS_KEY: '',
  BLOB_READ_WRITE_TOKEN: '',
  BLOB_STORE_ID: '',
  ANTIVIRUS_URL: '',
  APP_ENCRYPTION_KEY: randomBytes(48).toString('base64url'),
  DATA_DIR: directory,
  WEB_ORIGIN: 'http://localhost:3400',
  API_INTERNAL_URL: 'http://127.0.0.1:3401',
  SISLAM_BROWSER_URL: 'http://localhost:3400',
  SISLAM_BROWSER_ACCESS_FILE: path.join(directory, 'access.txt'),
  SISLAM_BROWSER_PASSWORD: 'Test-' + randomBytes(18).toString('base64url') + '!',
  SISLAM_BROWSER_MANUAL: process.argv.includes('--manual') ? '1' : '0',
};
function start(args, options = {}) {
  const child = spawn(process.execPath, args, {
    env,
    windowsHide: true,
    stdio: 'inherit',
    ...options,
  });
  children.push(child);
  return child;
}
function stop() {
  for (const child of children) {
    if (child.exitCode === null && child.pid) {
      if (process.platform === 'win32') {
        const result = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        if (result.status !== 0) child.kill('SIGTERM');
      } else child.kill('SIGTERM');
    }
  }
}
async function ready(url, child) {
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('O serviço de teste encerrou antes de iniciar');
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Serviço de teste não iniciou: ' + url);
}
async function main() {
  fs.mkdirSync('test-results', { recursive: true });
  for (const port of [3400, 3401]) {
    const net = require('node:net');
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', () =>
        reject(new Error(`Porta ${port} em uso; encerre a demonstração antes da suíte isolada`)),
      );
      server.listen(port, '127.0.0.1', () => server.close(resolve));
    });
  }
  const api = start([path.join(directory, 'compiled/scripts/browser-fixture.js')], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  await ready('http://127.0.0.1:3401/api/docs', api);
  const web = start(['node_modules/next/dist/bin/next', 'start', '-p', '3400', '-H', '127.0.0.1']);
  await ready('http://localhost:3400/login', web);
  const test = start([env.SISLAM_BROWSER_MANUAL === '1' ? 'scripts/browser-manual.cjs' : 'scripts/browser-test.cjs']);
  const code = await new Promise((resolve) => test.once('exit', resolve));
  if (code !== 0)
    throw new Error('Teste de navegador reprovado; consulte test-results/browser.json');
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Tempo excedido na restauração de backup')),
      120000,
    );
    api.once('message', (message) => {
      clearTimeout(timeout);
      if (message.error) reject(new Error(message.error));
      else {
        console.log('Backup da suíte restaurado e conferido:', JSON.stringify(message.backup));
        resolve();
      }
    });
    api.send('verify-backup');
  });
}
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(stop);

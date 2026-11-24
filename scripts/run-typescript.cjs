// Local API entry points need decorator metadata, which Node's built-in type stripping
// does not emit. Compile in memory without tsx's OS-user/IPC bootstrap on Windows.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const entry = process.argv[2];
if (!entry) throw new Error('Informe o arquivo TypeScript de entrada.');
require.extensions['.ts'] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    fileName: filename,
  });
  module._compile(compiled.outputText, filename);
};
process.argv.splice(1, 1);
require(path.resolve(entry));

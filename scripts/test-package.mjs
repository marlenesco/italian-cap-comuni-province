import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const packageName = manifest.name;
const directory = mkdtempSync(join(tmpdir(), 'iccp-package-'));
const run = (command, args, cwd = directory) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message || result.stderr.slice(0, 2000));
  return result.stdout;
};
try {
  // Exercise prepack as well; lifecycle output may precede npm's JSON response.
  const output = run('npm', ['pack', '--json', '--pack-destination', directory], process.cwd());
  const packed = JSON.parse(output.slice(output.indexOf('[\n')))[0];
  assert.equal(packed.name, packageName);
  assert.equal(packed.version, manifest.version);
  assert(packed.files.every((f) => /^(dist\/|README\.md$|LICENSE$|package\.json$)/.test(f.path)));
  const assets = packed.files.filter((f) => f.path.endsWith('.json')).map((f) => f.path);
  assert.deepEqual(assets.sort(), ['dist/gi_comuni_cap.json', 'dist/gi_province.json', 'dist/gi_regioni.json', 'package.json']);
  writeFileSync(join(directory, 'package.json'), '{"private":true}');
  run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', join(directory, packed.filename)]);
  const require = createRequire(join(directory, 'consumer.cjs'));
  const cjs = require(packageName);
  const packageDirectory = join(directory, 'node_modules', ...packageName.split('/'));
  const installed = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
  assert.equal(installed.name, packageName);
  assert.equal(installed.version, manifest.version);
  if (packageName.startsWith('@')) {
    assert.equal(installed.publishConfig?.access, 'public');
    assert.equal(installed.publishConfig?.registry, 'https://registry.npmjs.org/');
  }
  for (const asset of assets.filter((f) => f.startsWith('dist/'))) {
    const table = JSON.parse(readFileSync(join(packageDirectory, asset)));
    assert(Array.isArray(table.columns) && Array.isArray(table.rows));
  }
  assert.deepEqual(cjs.getProvinceAutonome().map((province) => province.sigla), ['BZ', 'TN']);
  const cjsResult = { exports: Object.keys(cjs).sort(), records: cjs.getAllComuni(), stats: cjs.getStats(), autonomous: cjs.getProvinceAutonome(), regionsAndAutonomous: cjs.getRegioniAndProvinceAutonome() };
  const esmOutput = run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import lib, * as api from ${JSON.stringify(packageName)};
    assert.equal(lib.getComuneByIstat('028001').nome, 'Abano Terme');
    assert(api.getComuniByCAP('00118').length > 0);
    console.log(JSON.stringify({exports:Object.keys(api).sort(),records:api.getAllComuni(),stats:api.getStats(),autonomous:api.getProvinceAutonome(),regionsAndAutonomous:api.getRegioniAndProvinceAutonome()}));
  `]);
  assert.deepEqual(JSON.parse(esmOutput), JSON.parse(JSON.stringify(cjsResult)));
  assert.equal(cjs.default.getAllComuni().length, cjs.getAllComuni().length);
  const bundled = await build({
    stdin: {
      contents: `
        import lib, * as api from ${JSON.stringify(packageName)};
        globalThis.result = {
          records: api.getAllComuni(),
          stats: lib.getStats(),
          autonomous: api.getProvinceAutonome(),
          regionsAndAutonomous: api.getRegioniAndProvinceAutonome(),
        };
      `,
      resolveDir: directory,
    },
    platform: 'browser', format: 'iife', target: 'es2020', bundle: true, write: false,
  });
  const context = {};
  runInNewContext(bundled.outputFiles[0].text, context);
  const { exports: _exports, ...browserResult } = cjsResult;
  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), JSON.parse(JSON.stringify(browserResult)));
  assert(readdirSync(join(packageDirectory, 'dist')).filter((f) => f.endsWith('.cjs')).length === 3);
  console.log(`Packed consumers passed: CJS, ESM and browser bundle (${packed.size} packed / ${packed.unpackedSize} unpacked bytes).`);
} finally { rmSync(directory, { recursive: true, force: true }); }

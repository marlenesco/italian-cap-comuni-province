import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

export async function testCAPPackage(directory, packageName, expectedCAPs, run) {
  const entry = `${packageName}/cap`;
  const samples = ['00118', '35031', '98168', '20100', '99999', '118', ' 00118 '];
  const expected = new Set(expectedCAPs);
  const expectedResults = samples.map((cap) => expected.has(cap.trim()));
  const exercise = `console.log(JSON.stringify(${JSON.stringify(samples)}.map(hasCAP)));`;
  const cjs = run(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const { hasCAP } = require(${JSON.stringify(entry)});
    assert(!Object.keys(require.cache).some(path => /[/\\\\](index\\.js|gi_[^/\\\\]+)$/.test(path)));
    ${exercise}
  `]);
  const esm = run(process.execPath, ['--input-type=module', '-e', `
    import { hasCAP } from ${JSON.stringify(entry)};
    ${exercise}
  `]);
  assert.deepEqual(JSON.parse(cjs), expectedResults);
  assert.deepEqual(JSON.parse(esm), expectedResults);

  for (const extension of ['mts', 'cts']) {
    writeFileSync(join(directory, `cap-consumer.${extension}`), `
      import { hasCAP } from ${JSON.stringify(entry)};
      const found: boolean = hasCAP('00118');
      // @ts-expect-error Postal codes are strings so leading zeros survive.
      hasCAP(118);
    `);
  }
  run(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--noEmit', '--strict',
    '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2020',
    'cap-consumer.mts', 'cap-consumer.cts']);

  const bundle = (contents) => build({
    stdin: { contents, resolveDir: directory },
    platform: 'browser', format: 'iife', target: 'es2020',
    bundle: true, minify: true, metafile: true, write: false,
  });
  const compact = await bundle(`import { hasCAP } from ${JSON.stringify(entry)}; globalThis.hasCAP = hasCAP;`);
  const inputs = Object.keys(compact.metafile.inputs);
  assert(inputs.some((path) => path.endsWith('/dist/cap.mjs')));
  assert(!inputs.some((path) => /(?:gi_(?:comuni_cap|province|regioni)|[/]dist[/]index\.)/.test(path)),
    `The CAP entry must not load full geographic data: ${inputs.join(', ')}`);
  const context = {};
  runInNewContext(compact.outputFiles[0].text, context);
  for (let number = 0; number < 100_000; number++) {
    const cap = String(number).padStart(5, '0');
    assert.equal(context.hasCAP(cap), expected.has(cap), cap);
  }
  assert.deepEqual(samples.map((cap) => context.hasCAP(cap)), expectedResults);

  const full = await bundle(`import { getComuniByCAP } from ${JSON.stringify(packageName)}; globalThis.hasCAP = cap => getComuniByCAP(cap).length > 0;`);
  const sizes = (result) => ({ minified: result.outputFiles[0].contents.length, gzip: gzipSync(result.outputFiles[0].contents).length });
  const report = { full: sizes(full), cap: sizes(compact) };
  // Allow modest dataset growth while catching accidental full-dataset imports.
  assert(report.cap.minified < 45_000, `CAP bundle exceeds 45 kB: ${report.cap.minified}`);
  assert(report.cap.gzip < 14_000, `CAP bundle exceeds 14 kB gzip: ${report.cap.gzip}`);
  console.log(`Isolated minified browser bundles (bytes): ${JSON.stringify(report)}`);
}

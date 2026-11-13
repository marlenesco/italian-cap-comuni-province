import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { cpus, platform, release } from 'node:os';

// Run against an already built directory; every timing sample uses a new process.
const [directory = 'dist', output, packReport] = process.argv.slice(2);
const dist = resolve(directory);
const bytes = (buffer) => ({
  bytes: buffer.length,
  gzip: gzipSync(buffer, { level: 9 }).length,
  brotli: brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
});
const files = readdirSync(dist).sort().map((file) => ({ file, ...bytes(readFileSync(join(dist, file))) }));
const sum = (items) => Object.fromEntries(['bytes', 'gzip', 'brotli'].map((key) => [key, items.reduce((n, item) => n + item[key], 0)]));
const sources = readdirSync('src/data').filter((f) => /^gi_.*\.json$/.test(f)).sort().map((file) => {
  const buffer = readFileSync(join('src/data', file));
  return { file, ...bytes(buffer), minified: bytes(Buffer.from(JSON.stringify(JSON.parse(buffer)))) };
});
const samples = {};
for (const format of ['cjs', 'esm']) {
  const results = [];
  for (let sample = 0; sample < 15; sample++) {
    const child = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
      import { performance } from 'node:perf_hooks';
      import { createRequire } from 'node:module';
      import { pathToFileURL } from 'node:url';
      global.gc(); const before = process.memoryUsage().heapUsed;
      const start = performance.now();
      const lib = ${format === 'cjs' ? `createRequire(import.meta.url)(${JSON.stringify(join(dist, 'index.js'))})` : `await import(pathToFileURL(${JSON.stringify(join(dist, 'index.mjs'))}))`};
      const startupMs = performance.now() - start;
      global.gc(); const heapBytes = process.memoryUsage().heapUsed - before;
      let sink = 0;
      const caps = ['35031', '00118', '25080', '70121', '99999'];
      const codes = ['028001', '058091', '015146', '072006', '999999'];
      function cap(i) { sink += lib.getComuniByCAP(caps[i % 5]).length; }
      function istat(i) { sink += lib.getComuneByIstat(codes[i % 5]) ? 1 : 0; }
      const queries = ['Milano', 'San', 'Forli', 'Bolzano', 'zzzzzz'];
      function name(i) { sink += lib.searchComuni(queries[i % 5], { limit: 10 }).length; }
      function time(fn, count) {
        for(let i=0;i<Math.min(count, 10000);i++) fn(i);
        const start = performance.now(); for(let i=0;i<count;i++) fn(i);
        return (performance.now()-start)*1e6/count;
      }
      console.log(JSON.stringify({startupMs,heapBytes,capNs:time(cap,200000),istatNs:time(istat,200000),nameNs:time(name,25),sink}));
    `], { encoding: 'utf8' });
    if (child.status !== 0) { results.push({ error: child.stderr.trim().split('\n').slice(0, 8).join('\n') }); break; }
    results.push(JSON.parse(child.stdout));
  }
  const median = (key) => results.map((r) => r[key]).sort((a, b) => a - b)[Math.floor(results.length / 2)];
  samples[format] = results[0]?.error ? results[0] : {
    count: results.length,
    median: Object.fromEntries(['startupMs','heapBytes','capNs','istatNs','nameNs'].map((key) => [key, median(key)])),
    samples: results,
  };
}
const report = {
  environment: { node: process.version, platform: platform(), release: release(), cpu: cpus()[0].model },
  protocol: '15 fresh processes/format; warm filesystem cache, no module cache across samples; median; explicit GC heap delta; gzip-9/Brotli-11 per file then summed; 200k CAP/ISTAT, 25 names after warmup.',
  sources, sourceTotals: sum(sources), minifiedSourceTotals: sum(sources.map((s) => s.minified)),
  files, dist: sum(files), runtime: sum(files.filter((f) => /\.(js|mjs|cjs|json)$/.test(f.file))),
  pack: packReport ? JSON.parse(readFileSync(packReport))[0] : undefined, samples,
};
const json = JSON.stringify(report, null, 2) + '\n';
if (output) writeFileSync(output, json); else console.log(json);
console.log(JSON.stringify({dist:report.dist,runtime:report.runtime,samples:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,v.median||v]))}));

import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, symlinkSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';

const directory = mkdtempSync(join(tmpdir(), 'iccp-build-'));
const tsup = resolve('node_modules/.bin/tsup');
let watcher;
let output = '';
let changes = 0;
const read = (path) => JSON.parse(readFileSync(join(directory, path), 'utf8'));
const requireResult = () => {
  const result = spawnSync(process.execPath, ['-e', "console.log(require('./dist').getAllComuni()[0].nome)"], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
async function waitForBuild(expected) {
  // Only bounded completion checks while exercising an actively running watch build.
  for (let attempt = 0; attempt < 100; attempt++) {
    if (watcher.exitCode !== null) throw new Error(output);
    if (changes >= expected) {
      try { if (requireResult() === 'Abano Terme (watch fixture)') return; } catch { /* The build may still be replacing its output. */ }
    }
    await delay(100);
  }
  throw new Error(`Watch build timed out: ${output.slice(-3000)}`);
}
try {
  for (const path of ['src', 'scripts/data', 'tsup.config.ts', 'tsconfig.json', 'package.json']) cpSync(path, join(directory, path), { recursive: true });
  rmSync(join(directory, 'src/generated'), { recursive: true, force: true });
  symlinkSync(resolve('node_modules'), join(directory, 'node_modules'), 'dir');
  const source = read('src/data/gi_comuni_cap.json');
  const fixtureCode = source[0].codice_istat;
  const fixtureCAPs = new Set(source.filter((row) => row.codice_istat === fixtureCode).map((row) => row.cap));
  let fixtureCAP = 10;
  while (fixtureCAPs.has(String(fixtureCAP).padStart(5, '0'))) fixtureCAP++;
  source.push({ ...source[0], cap: String(fixtureCAP).padStart(5, '0') });
  for (const row of source) if (row.codice_istat === fixtureCode) row.denominazione_ita = 'Abano Terme (build fixture)';
  writeFileSync(join(directory, 'src/data/gi_comuni_cap.json'), JSON.stringify(source));
  const result = spawnSync(process.execPath, [tsup], { cwd: directory, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(requireResult(), 'Abano Terme (build fixture)');
  assert.equal(read('dist/gi_comuni_cap.json').rows[0][2], 'Abano Terme (build fixture)');
  watcher = spawn(process.execPath, [tsup, '--watch', 'src', '--watch', 'scripts/data'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const capture = (chunk) => {
    output += chunk.toString();
    // CI enables ANSI colors; normalize accumulated output, including split chunks.
    const text = stripVTControlCharacters(output);
    changes = (text.match(/CJS ⚡️ Build success/g) || []).length;
    if (text.includes('Watching for changes')) resolveReady();
  };
  watcher.stdout.on('data', capture); watcher.stderr.on('data', capture);
  let timeout;
  try { await Promise.race([ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Watcher did not start')), 10000); })]); } finally { clearTimeout(timeout); }
  // Allow the initial watched build to finish before modifying its source.
  await delay(1500);
  const before = changes;
  for (const row of source) if (row.codice_istat === fixtureCode) row.denominazione_ita = 'Abano Terme (watch fixture)';
  writeFileSync(join(directory, 'src/data/gi_comuni_cap.json'), JSON.stringify(source));
  await waitForBuild(before + 1);
  const stable = changes;
  await delay(1800);
  assert.equal(changes, stable, 'Generated output caused a watch loop');
  console.log('Source regeneration passed for build and watch; no generated-file rebuild loop.');
} finally {
  if (watcher && watcher.exitCode === null) {
    watcher.kill('SIGTERM');
    await new Promise((resolve) => watcher.once('exit', resolve));
  }
  rmSync(directory, { recursive: true, force: true });
}

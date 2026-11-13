import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildData, toTable } from './build.mjs';
import { readDatasets, schemas, sha256, tables, verifyDatasets } from './schema.mjs';
import { readArchive, crc32 } from './zip.mjs';
import { download, discoverArchive, sourcePage } from './source.mjs';
import { updateDatasets, replaceDatasets, verifyLocal } from './update.mjs';
import { compareDatasets, formatReport } from './report.mjs';
import { fixture, buffers, datasetZip, zip } from './test-helpers.mjs';

const directories = [];
const temp = () => { const path = mkdtempSync(join(tmpdir(), 'iccp-data-test-')); directories.push(path); return path; };
const setup = (data = fixture()) => {
  const root = temp();
  const directory = join(root, 'src/data');
  mkdirSync(directory, { recursive: true });
  for (const [name, buffer] of Object.entries(buffers(data))) writeFileSync(join(directory, `${name}.json`), buffer);
  const archive = join(root, 'official.zip');
  writeFileSync(archive, datasetZip(data));
  return { root, directory, archive };
};
const snapshot = (dir) => readdirSync(dir).map((name) => [name, readFileSync(join(dir, name)), statSync(join(dir, name)).mtimeMs]);
afterEach(() => { vi.useRealTimers(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('Offline validation and deterministic generation', () => {
  it('accepts all original datasets and records', () => {
    const data = readDatasets('src/data');
    expect(verifyDatasets(data)).toEqual(Object.fromEntries(tables.map((name) => [name, data[name].length])));
    expect(verifyLocal()).toEqual(verifyDatasets(readDatasets('src/data')));
  });
  for (const name of tables) {
    it(`rejects missing, empty, nonobject and incompatible ${name} schemas`, () => {
      for (const value of [undefined, [], [null], [[]], [{ unexpected: '' }]]) {
        const data = fixture(); data[name] = value;
        expect(() => verifyDatasets(data)).toThrow();
      }
      for (const field of schemas[name]) {
        for (const value of [null, 1, undefined, ...(field === 'denominazione_altra' ? [] : [''])]) {
          const data = fixture(); data[name][0][field] = value;
          expect(() => verifyDatasets(data)).toThrow();
        }
      }
      const data = fixture(); data[name][0].new_field = 'new';
      expect(() => verifyDatasets(data)).toThrow(/schema/);
    });
    it(`is lossless, deterministic and avoids rewriting ${name}`, () => {
      const data = fixture();
      const table = toTable(data[name], schemas[name]);
      expect(table.rows.map((row) => Object.fromEntries(table.columns.map((key, i) => [key, row[i]])))).toEqual(data[name]);
      const { directory, root } = setup(data);
      const target = join(root, 'generated');
      buildData(directory, target);
      const before = snapshot(target);
      buildData(directory, target);
      expect(snapshot(target)).toEqual(before);
      data[name][0].superficie_kmq = '1.000000';
      writeFileSync(join(directory, `${name}.json`), JSON.stringify(data[name]));
      buildData(directory, target);
      expect(JSON.parse(readFileSync(join(target, `${name}.json`))).rows).toEqual(toTable(data[name], schemas[name]).rows);
      expect(() => buildData(directory, '/dev/null/cannot-write')).toThrow();
    });
  }
  it.each([
    ['gi_comuni_cap', 'codice_istat', '12345'], ['gi_comuni_cap', 'cap', '00000'],
    ['gi_comuni_cap', 'cap', '98169'], ['gi_comuni_cap', 'flag_capoluogo', 'true'],
    ['gi_comuni_cap', 'codice_belfiore', '1234'], ['gi_comuni_cap', 'lat', '91'],
    ['gi_comuni_cap', 'lon', 'NaN'], ['gi_comuni_cap', 'superficie_kmq', '-1'],
    ['gi_comuni_cap', 'codice_regione', '21'], ['gi_comuni_cap', 'sigla_provincia', 'bad'],
    ['gi_province', 'codice_sovracomunale', '1'], ['gi_province', 'numero_comuni', '1.2'],
    ['gi_regioni', 'tipologia_regione', 'unknown'], ['gi_regioni', 'ripartizione_geografica', 'unknown'],
  ])('rejects invalid %s.%s', (name, key, value) => {
    const data = fixture(); data[name][0][key] = value;
    expect(() => verifyDatasets(data)).toThrow();
  });
  it('preserves valid many-to-many CAP relations and rejects duplicate pairs', () => {
    const data = fixture();
    data.gi_comuni_cap.push({ ...data.gi_comuni_cap[0], cap: '35032' });
    expect(verifyDatasets(data).gi_comuni_cap).toBe(2);
    data.gi_comuni_cap.push({ ...data.gi_comuni_cap[0] });
    expect(() => verifyDatasets(data)).toThrow(/duplicate/);
  });
  it('rejects inconsistent province/region relationships, counts and multi-CAP values', () => {
    for (const [name, field, value] of [
      ['gi_comuni_cap', 'codice_regione', '01'], ['gi_comuni_cap', 'sigla_provincia', 'XX'],
      ['gi_comuni_cap', 'denominazione_provincia', 'other'], ['gi_comuni_cap', 'denominazione_regione', 'other'],
      ['gi_province', 'numero_comuni', '2'], ['gi_regioni', 'numero_comuni', '2'], ['gi_regioni', 'numero_province', '2'],
    ]) {
      const data = fixture(); data[name][0][field] = value;
      expect(() => verifyDatasets(data)).toThrow();
    }
    const data = fixture(); data.gi_comuni_cap.push({ ...data.gi_comuni_cap[0], cap: '35032', lat: '46' });
    expect(() => verifyDatasets(data)).toThrow(/multi-CAP/);
  });
  it('detects checksum and record-count mismatches in provenance', () => {
    const { directory } = setup();
    writeFileSync(join(directory, 'provenance.json'), JSON.stringify({ datasets: {} }));
    expect(() => verifyLocal(directory)).toThrow(/provenance/);
  });
});

describe('Bounded ZIP extraction', () => {
  it('validates the standard CRC32 vector and reads stored and deflated entries', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    for (const options of [{}, { stored: true }, { flags: 2 }]) expect(readArchive(datasetZip(fixture(), [], options))).toEqual(buffers(fixture()));
  });
  it.each(['../escape', '/escape', 'C:/escape', 'a\\escape', 'a/../escape', 'a/./escape', 'a//escape', 'a\0escape'])('rejects unsafe ZIP path %s', (name) => {
    expect(() => readArchive(datasetZip(fixture(), [[name, Buffer.from('x')]]))).toThrow(/unsafe/);
  });
  it('rejects duplicates, symlinks, encryption, missing datasets and decompression bombs', () => {
    const content = Buffer.from('x');
    for (const extra of [
      [['README', content], ['README', content]], [['link', content, { attributes: 0xa1ff0000 }]],
      [['secret', content, { flags: 1 }]], [['bomb', Buffer.alloc(2 * 1024 * 1024)]],
    ]) expect(() => readArchive(datasetZip(fixture(), extra))).toThrow();
    expect(() => readArchive(zip([]))).toThrow(/missing/);
    expect(() => readArchive(Buffer.alloc(0))).toThrow(/size/);
    expect(() => readArchive(Buffer.alloc(33 * 1024 * 1024))).toThrow(/size/);
  });
  it('rejects truncated archives, central/local mismatches and corrupt CRCs', () => {
    const original = datasetZip(fixture());
    expect(() => readArchive(original.subarray(0, original.length - 1))).toThrow();
    const corrupt = Buffer.from(original);
    const central = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    corrupt.writeUInt32LE(1, central + 16);
    expect(() => readArchive(corrupt)).toThrow(/CRC/);
    const local = Buffer.from(original); local[30] = 0x78;
    expect(() => readArchive(local)).toThrow(/mismatch/);
    const multipart = Buffer.from(original); multipart.writeUInt16LE(1, multipart.length - 18);
    expect(() => readArchive(multipart)).toThrow(/central/);
    const badHeader = Buffer.from(original); badHeader[0] = 0;
    expect(() => readArchive(badHeader)).toThrow(/local/);
  });
});

describe('Source discovery and HTTP failures', () => {
  const html = '<p>Dati aggiornati al 06/11/2026</p><a href="/gi_db_comuni/release.zip">Download</a>';
  it('discovers links dynamically, deduplicates anchors and fails closed on page changes', () => {
    expect(discoverArchive(html + html)).toEqual({ archiveUrl: 'https://www.gardainformatica.it/gi_db_comuni/release.zip', sourceDate: '2026-11-06' });
    for (const page of ['', '<a href="https://evil.example/release.zip">x</a>', html.replace('06/11/2026', '31/02/2026'), html.replace('Dati aggiornati al', 'unknown'), html + '<a href="/gi_db_comuni/other.zip">x</a>']) expect(() => discoverArchive(page)).toThrow();
  });
  it('handles successful downloads and same-origin redirects', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/file' } })).mockResolvedValueOnce(new Response('ok', { headers: { 'content-length': '2' } }));
    expect((await download(sourcePage, 100, fetcher)).buffer.toString()).toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects HTTP errors, invalid sizes, incomplete responses and redirect violations', async () => {
    for (const response of [new Response('no', { status: 503 }), new Response('x', { headers: { 'content-length': '1000' } }), new Response('x', { headers: { 'content-length': '3' } }), new Response(''), new Response('abc'), new Response(null, { status: 302 }), new Response(null, { status: 302, headers: { location: 'https://evil.example' } })]) await expect(download(sourcePage, 2, async () => response)).rejects.toThrow();
    await expect(download('https://evil.example', 100)).rejects.toThrow(/URL/);
    await expect(download(sourcePage, 100, async () => new Response(null, { status: 302, headers: { location: '/again' } }))).rejects.toThrow(/redirects/);
    await expect(download(sourcePage, 100, async () => { throw new Error('offline'); })).rejects.toThrow(/offline/);
  });
  it('aborts requests at the timeout and clears its timer', async () => {
    vi.useFakeTimers();
    const promise = download(sourcePage, 100, (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    const assertion = expect(promise).rejects.toThrow(/aborted/);
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Transactional updates and reports', () => {
  it('does not write unchanged sources or metadata, including a repeated update', async () => {
    const { directory, archive } = setup();
    const before = snapshot(directory);
    expect((await updateDatasets({ directory, archive })).changed).toBe(false);
    expect(snapshot(directory)).toEqual(before);
  });
  it('reports changes without writing during dry-run, then applies an idempotent update', async () => {
    const { directory, archive, root } = setup();
    const before = snapshot(directory);
    const next = fixture(); next.gi_comuni_cap[0].denominazione_ita = 'Città nuova';
    next.gi_comuni_cap.push({ ...next.gi_comuni_cap[0], cap: '35032' });
    writeFileSync(archive, datasetZip(next));
    const report = await updateDatasets({ directory, archive, sourceDate: '2026-11-06', dryRun: true, report: join(root, 'report.json') });
    expect(snapshot(directory)).toEqual(before);
    expect(report.changed).toBe(true);
    expect(report.postalCodes).toHaveLength(1);
    expect(report.tables.gi_comuni_cap.modified).toHaveLength(1);
    expect(formatReport(report)).toContain('CAP associations changed for 1');
    expect(JSON.parse(readFileSync(join(root, 'report.json'))).source.archiveSha256).toBe(sha256(readFileSync(archive)));
    await updateDatasets({ directory, archive, sha256: sha256(readFileSync(archive)) });
    expect(readDatasets(directory)).toEqual(next);
    expect(verifyLocal(directory).gi_comuni_cap).toBe(2);
    const after = snapshot(directory);
    expect((await updateDatasets({ directory, archive })).changed).toBe(false);
    expect(snapshot(directory)).toEqual(after);
  });
  it('acquires the official page and archive through the bounded HTTP path', async () => {
    const { directory } = setup();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('<p>Dati aggiornati al 06/11/2026</p><a href="/gi_db_comuni/latest.zip">x</a>')).mockResolvedValueOnce(new Response(datasetZip(fixture())));
    const report = await updateDatasets({ directory, dryRun: true, fetcher });
    expect(report.changed).toBe(false);
    expect(report.source.sourceDate).toBe('2026-11-06');
    expect(report.source.archiveUrl).toContain('latest.zip');
  });
  it('preserves all source bytes on checksum, archive, schema, date or report failures', async () => {
    const { directory, archive } = setup();
    const before = snapshot(directory);
    for (const options of [{ sha256: '0'.repeat(64) }, { sourceDate: '2026-02-31' }, { report: join(directory, 'gi_regioni.json') }]) await expect(updateDatasets({ directory, archive, ...options })).rejects.toThrow();
    writeFileSync(archive, 'not a zip');
    await expect(updateDatasets({ directory, archive })).rejects.toThrow();
    const bad = fixture(); bad.gi_comuni_cap[0].new_field = 'x';
    writeFileSync(archive, datasetZip(bad));
    await expect(updateDatasets({ directory, archive })).rejects.toThrow(/schema/);
    expect(snapshot(directory)).toEqual(before);
  });
  it('accepts lowercase autonomous-province categories without rewriting source values', async () => {
    const { directory, archive, root } = setup();
    const before = snapshot(directory);
    const next = fixture();
    next.gi_province[0].tipologia_provincia = 'provincia autonoma';
    next.gi_comuni_cap[0].tipologia_provincia = 'provincia autonoma';
    writeFileSync(archive, datasetZip(next));
    const reportPath = join(root, 'update.json');
    expect((await updateDatasets({ directory, archive, report: reportPath })).changed).toBe(true);
    expect(snapshot(directory)).not.toEqual(before);
    expect(readDatasets(directory)).toEqual(next);
    expect(verifyLocal(directory).gi_province).toBe(1);
    const target = join(root, 'generated');
    buildData(directory, target);
    for (const name of ['gi_province', 'gi_comuni_cap']) {
      const table = JSON.parse(readFileSync(join(target, `${name}.json`)));
      expect(table.rows[0][table.columns.indexOf('tipologia_provincia')]).toBe('provincia autonoma');
    }
    const child = spawnSync(process.execPath, [resolve('scripts/data/cli.mjs'), 'update', '--archive', archive], { cwd: root, encoding: 'utf8' });
    expect(child.status).toBe(0);
    expect(child.stderr).toBe('');
    expect(child.stdout).toContain('Result: no changes');
    expect(readDatasets(directory)).toEqual(next);
  });
  it('rolls back a failed directory swap', () => {
    const { directory } = setup(); const before = snapshot(directory);
    const files = buffers(fixture());
    const provenance = { datasets: Object.fromEntries(tables.map((name) => [name, { sha256: sha256(files[name]), records: 1 }])) };
    let calls = 0;
    expect(() => replaceDatasets(directory, files, provenance, (from, to) => { if (++calls === 2) throw new Error('simulated rename failure'); renameSync(from, to); })).toThrow(/simulated/);
    expect(snapshot(directory)).toEqual(before);
  });
  it('reports additions, removals, field changes, order and schema changes', () => {
    const before = fixture(); const after = structuredClone(before);
    after.gi_comuni_cap[0].codice_istat = '999999';
    after.gi_province[0].denominazione_provincia = 'New name';
    const report = compareDatasets(before, after, buffers(before), buffers(after));
    expect(report.municipalities.added).toHaveLength(1);
    expect(report.municipalities.removed).toHaveLength(1);
    expect(report.tables.gi_province.modified[0].changes.denominazione_provincia.after).toBe('New name');
    expect(report.tables.gi_comuni_cap.orderChanged).toBe(true);
    expect(report.tables.gi_regioni.schema.before).toEqual(schemas.gi_regioni);
  });
  it('provides offline CLI commands and rejects incomplete options', () => {
    const { root, archive } = setup();
    const cli = resolve('scripts/data/cli.mjs');
    for (const args of [['verify'], ['check', '--archive', archive], ['update', '--archive', archive, '--dry-run', '--report', join(root, 'report.json')]]) {
      const child = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
      expect(child.stderr).toBe(''); expect(child.status).toBe(0);
    }
    for (const args of [['unknown'], ['verify', '--dry-run'], ['update', '--archive'], ['check', '--report', 'x'], ['update', '--bad']]) expect(spawnSync(process.execPath, [cli, ...args], { cwd: root }).status).toBe(1);
  });
});

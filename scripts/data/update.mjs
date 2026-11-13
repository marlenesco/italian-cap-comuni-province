import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, dirname } from 'node:path';
import { buildData } from './build.mjs';
import { tables, sha256, readDatasets, verifyDatasets } from './schema.mjs';
import { readArchive } from './zip.mjs';
import { discoverArchive, download, sourcePage } from './source.mjs';
import { compareDatasets, formatReport } from './report.mjs';

export function verifyLocal(directory = 'src/data') {
  const datasets = readDatasets(directory);
  const counts = verifyDatasets(datasets);
  const metadata = join(directory, 'provenance.json');
  if (existsSync(metadata)) {
    const provenance = JSON.parse(readFileSync(metadata, 'utf8'));
    for (const name of tables) if (sha256(readFileSync(join(directory, `${name}.json`))) !== provenance.datasets[name]?.sha256 || counts[name] !== provenance.datasets[name]?.records) throw new Error(`${name}: provenance mismatch`);
  }
  return counts;
}

// Stage the entire directory, then swap it with rollback on a handled rename failure.
export function replaceDatasets(directory, files, provenance, rename = renameSync) {
  const parent = dirname(resolve(directory));
  const temporary = mkdtempSync(join(parent, '.dataset-update-'));
  const stage = join(temporary, 'next');
  const backup = join(temporary, 'previous');
  try {
    cpSync(directory, stage, { recursive: true });
    for (const name of tables) writeFileSync(join(stage, `${name}.json`), files[name]);
    writeFileSync(join(stage, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
    verifyLocal(stage);
    // Generate and verify tables before any source files are replaced.
    buildData(stage, join(temporary, 'generated'));
    rename(directory, backup);
    try { rename(stage, directory); } catch (error) { renameSync(backup, directory); throw error; }
  } finally {
    // Keep the backup if an exceptional rollback failure left the source missing.
    if (existsSync(directory)) rmSync(temporary, { recursive: true, force: true });
  }
}

export async function updateDatasets(options = {}) {
  const directory = options.directory || 'src/data';
  verifyLocal(directory);
  if (options.report && (resolve(options.report) === resolve(directory) || resolve(options.report).startsWith(resolve(directory) + '/'))) throw new Error('Report must be outside the source directory');
  let archive;
  let archiveUrl = null;
  let sourceDate = options.sourceDate || null;
  if (options.archive) {
    if (statSync(options.archive).size > 32 * 1024 * 1024) throw new Error('Archive size limit exceeded');
    archive = readFileSync(options.archive);
  } else {
    const page = await download(sourcePage, 2 * 1024 * 1024, options.fetcher);
    const latest = discoverArchive(page.buffer.toString('utf8'));
    sourceDate = latest.sourceDate;
    const result = await download(latest.archiveUrl, 32 * 1024 * 1024, options.fetcher);
    archive = result.buffer;
    archiveUrl = result.url;
  }
  if (sourceDate && (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) || !Number.isFinite(Date.parse(sourceDate)) || new Date(sourceDate).toISOString().slice(0, 10) !== sourceDate)) throw new Error('Use --source-date YYYY-MM-DD');
  const archiveSha256 = sha256(archive);
  if (options.sha256 && (!/^[a-f\d]{64}$/i.test(options.sha256) || archiveSha256 !== options.sha256.toLowerCase())) throw new Error('Archive SHA-256 mismatch');
  const files = readArchive(archive);
  const text = new TextDecoder('utf-8', { fatal: true });
  const next = Object.fromEntries(tables.map((name) => [name, JSON.parse(text.decode(files[name]))]));
  const counts = verifyDatasets(next);
  const previous = readDatasets(directory);
  const beforeBuffers = Object.fromEntries(tables.map((name) => [name, readFileSync(join(directory, `${name}.json`))]));
  const diff = compareDatasets(previous, next, beforeBuffers, files);
  const source = {
    sourcePage, archiveUrl, sourceDate, acquiredAt: new Date().toISOString(), archiveSha256,
    ...(options.archive ? { localArchive: basename(options.archive) } : {}),
    datasets: Object.fromEntries(tables.map((name) => [name, { sha256: sha256(files[name]), records: counts[name], bytes: files[name].length }])),
  };
  const report = { ...diff, source };
  if (options.report) {
    const target = resolve(options.report);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
    writeFileSync(`${target}.md`, formatReport(report));
  }
  if (report.changed && !options.dryRun) {
    const changes = Object.fromEntries(tables.map((name) => [name, Object.fromEntries(['added', 'removed', 'modified'].map((key) => [key, diff.tables[name][key].length]))]));
    replaceDatasets(resolve(directory), files, { ...source, changes });
  }
  return report;
}

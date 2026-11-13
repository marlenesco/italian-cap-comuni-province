import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDatasets, schemas, tables, verifyDatasets } from './schema.mjs';

export function toTable(records, columns) {
  return { columns, rows: records.map((record) => columns.map((key) => record[key])) };
}

export function buildData(source = 'src/data', target = 'src/generated') {
  const datasets = readDatasets(source);
  verifyDatasets(datasets);
  mkdirSync(target, { recursive: true });
  for (const name of tables) {
    const output = JSON.stringify(toTable(datasets[name], schemas[name])) + '\n';
    const path = join(target, `${name}.json`);
    let previous;
    try { previous = readFileSync(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous !== output) writeFileSync(path, output);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildData();

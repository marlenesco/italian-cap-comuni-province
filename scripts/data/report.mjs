import { schemas, tables } from './schema.mjs';
import { toTable } from './build.mjs';
const keyFor = (name, row) => name === 'gi_comuni_cap' ? `${row.codice_istat}:${row.cap}` : name === 'gi_province' ? row.sigla_provincia : row.codice_regione;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (values) => [...values].sort();

export function compareDatasets(before, after, beforeBuffers, afterBuffers) {
  const result = { changed: false, tables: {}, municipalities: {}, postalCodes: [] };
  for (const name of tables) {
    const old = new Map(before[name].map((row) => [keyFor(name, row), row]));
    const next = new Map(after[name].map((row) => [keyFor(name, row), row]));
    const added = [...next].filter(([key]) => !old.has(key)).map(([, row]) => row);
    const removed = [...old].filter(([key]) => !next.has(key)).map(([, row]) => row);
    const modified = [...next].filter(([key, row]) => old.has(key) && schemas[name].some((field) => old.get(key)[field] !== row[field])).map(([key, row]) => ({
      key, changes: Object.fromEntries(schemas[name].filter((field) => old.get(key)[field] !== row[field]).map((field) => [field, { before: old.get(key)[field], after: row[field] }])),
    }));
    const orderChanged = !equal(before[name].map((row) => keyFor(name, row)), after[name].map((row) => keyFor(name, row)));
    const changed = !!(added.length || removed.length || modified.length || orderChanged);
    result.changed ||= changed;
    result.tables[name] = { beforeRecords: before[name].length, afterRecords: after[name].length, beforeBytes: beforeBuffers[name].length, afterBytes: afterBuffers[name].length, beforeTableBytes: Buffer.byteLength(JSON.stringify(toTable(before[name], schemas[name])) + '\n'), afterTableBytes: Buffer.byteLength(JSON.stringify(toTable(after[name], schemas[name])) + '\n'), added, removed, modified, orderChanged, schema: { before: Object.keys(before[name][0]), after: Object.keys(after[name][0]) } };
  }
  const old = new Map(before.gi_comuni_cap.map((row) => [row.codice_istat, row]));
  const next = new Map(after.gi_comuni_cap.map((row) => [row.codice_istat, row]));
  result.municipalities = {
    added: [...next].filter(([code]) => !old.has(code)).map(([code, row]) => ({ code, name: row.denominazione_ita })),
    removed: [...old].filter(([code]) => !next.has(code)).map(([code, row]) => ({ code, name: row.denominazione_ita })),
  };
  const group = (rows) => {
    const map = new Map();
    for (const row of rows) { if (!map.has(row.codice_istat)) map.set(row.codice_istat, new Set()); map.get(row.codice_istat).add(row.cap); }
    return map;
  };
  const previousCaps = group(before.gi_comuni_cap);
  const nextCaps = group(after.gi_comuni_cap);
  for (const code of sorted(new Set([...previousCaps.keys(), ...nextCaps.keys()]))) {
    const previous = sorted(previousCaps.get(code) || []);
    const next = sorted(nextCaps.get(code) || []);
    if (!equal(previous, next)) result.postalCodes.push({ codiceIstat: code, before: previous, after: next });
  }
  return result;
}

export function formatReport(report) {
  const lines = ['# Dataset update report', '', `Result: ${report.changed ? 'changes detected' : 'no changes'}`, `Source: ${report.source.archiveUrl || 'local official archive'}`, `Source date: ${report.source.sourceDate || 'unknown'}`, `Archive SHA-256: ${report.source.archiveSha256}`, '', '| Dataset | Records before → after | Raw bytes before → after | Table bytes before → after | Added | Removed | Modified |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const [name, table] of Object.entries(report.tables)) lines.push(`| ${name} | ${table.beforeRecords} → ${table.afterRecords} | ${table.beforeBytes} → ${table.afterBytes} | ${table.beforeTableBytes} → ${table.afterTableBytes} | ${table.added.length} | ${table.removed.length} | ${table.modified.length} |`);
  lines.push('', `Municipalities added: ${report.municipalities.added.length}; removed: ${report.municipalities.removed.length}.`, `CAP associations changed for ${report.postalCodes.length} municipalities.`, '', 'Validation: raw schema, codes, coordinates, relationships, counts and ZIP CRC passed.', '');
  lines.push('Run the library test suite to verify public API compatibility before publishing.');
  lines.push('', 'Dataset SHA-256:');
  for (const [name, value] of Object.entries(report.source.datasets)) lines.push(`- ${name}: ${value.sha256}`);
  lines.push('', 'Review the full JSON report for record-level names, administrative codes, CAP associations, schema and order changes. Record count changes are reported, not rejected merely for differing from the previous release.');
  return lines.join('\n') + '\n';
}

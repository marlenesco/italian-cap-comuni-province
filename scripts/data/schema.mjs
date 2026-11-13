import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const schemas = {
  gi_comuni_cap: ['codice_istat', 'denominazione_ita_altra', 'denominazione_ita', 'denominazione_altra', 'cap', 'sigla_provincia', 'denominazione_provincia', 'tipologia_provincia', 'codice_regione', 'denominazione_regione', 'tipologia_regione', 'ripartizione_geografica', 'flag_capoluogo', 'codice_belfiore', 'lat', 'lon', 'superficie_kmq'],
  gi_province: ['codice_regione', 'sigla_provincia', 'denominazione_provincia', 'tipologia_provincia', 'numero_comuni', 'superficie_kmq', 'codice_sovracomunale'],
  gi_regioni: ['ripartizione_geografica', 'codice_regione', 'denominazione_regione', 'tipologia_regione', 'numero_province', 'numero_comuni', 'superficie_kmq'],
};
export const tables = Object.keys(schemas);
export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
export const readDatasets = (directory) => Object.fromEntries(tables.map((name) => [name, JSON.parse(readFileSync(join(directory, `${name}.json`), 'utf8'))]));

const fail = (message) => { throw new Error(message); };
const requireValue = (condition, message) => { if (!condition) fail(message); };
const numeric = (value) => /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));

// Validate raw values without correcting, deduplicating, or reordering records.
export function verifyDatasets(data) {
  for (const name of tables) {
    const rows = data[name];
    requireValue(Array.isArray(rows) && rows.length > 0, `${name}: missing or empty dataset`);
    const seen = new Set();
    for (const [i, row] of rows.entries()) {
      const context = `${name}[${i}]`;
      requireValue(row && typeof row === 'object' && !Array.isArray(row), `${context}: expected object`);
      requireValue(Object.keys(row).length === schemas[name].length && schemas[name].every((key) => Object.hasOwn(row, key)), `${context}: incompatible schema`);
      for (const key of schemas[name]) requireValue(typeof row[key] === 'string' && (key === 'denominazione_altra' || row[key].trim() !== ''), `${context}: invalid ${key}`);
      requireValue(/^\d{2}$/.test(row.codice_regione) && +row.codice_regione >= 1 && +row.codice_regione <= 20, `${context}: invalid region code`);
      requireValue(numeric(row.superficie_kmq) && +row.superficie_kmq > 0, `${context}: invalid area`);
      for (const key of ['numero_comuni', 'numero_province']) if (key in row) requireValue(/^\d+$/.test(row[key]) && +row[key] > 0, `${context}: invalid ${key}`);
      if ('tipologia_regione' in row) requireValue(['statuto ordinario', 'statuto speciale'].includes(row.tipologia_regione), `${context}: invalid region type`);
      if ('ripartizione_geografica' in row) requireValue(['Nord-ovest', 'Nord-est', 'Centro', 'Sud', 'Isole'].includes(row.ripartizione_geografica), `${context}: invalid geographical area`);
      if ('sigla_provincia' in row) requireValue(/^[A-Z]{2}$/.test(row.sigla_provincia), `${context}: invalid province code`);
      if ('codice_sovracomunale' in row) requireValue(/^\d{3}$/.test(row.codice_sovracomunale), `${context}: invalid supramunicipal code`);
      if (name === 'gi_comuni_cap') {
        requireValue(/^\d{6}$/.test(row.codice_istat), `${context}: invalid ISTAT code`);
        requireValue(/^\d{5}$/.test(row.cap) && +row.cap >= 10 && +row.cap <= 98168, `${context}: invalid CAP`);
        requireValue(['SI', 'NO'].includes(row.flag_capoluogo), `${context}: invalid capital flag`);
        requireValue(/^[A-Z]\d{3}$/.test(row.codice_belfiore), `${context}: invalid Belfiore code`);
        requireValue(numeric(row.lat) && +row.lat >= 35 && +row.lat <= 48 && numeric(row.lon) && +row.lon >= 6 && +row.lon <= 20, `${context}: invalid coordinates`);
      }
      const id = name === 'gi_comuni_cap' ? `${row.codice_istat}:${row.cap}` : name === 'gi_province' ? row.sigla_provincia : row.codice_regione;
      requireValue(!seen.has(id), `${context}: duplicate identity ${id}`);
      seen.add(id);
    }
  }
  const regions = new Map(data.gi_regioni.map((row) => [row.codice_regione, row]));
  const provinces = new Map(data.gi_province.map((row) => [row.sigla_provincia, row]));
  requireValue(new Set(data.gi_province.map((row) => row.codice_sovracomunale)).size === provinces.size, 'Duplicate supramunicipal code');
  const municipalities = new Map();
  for (const row of data.gi_comuni_cap) {
    const province = provinces.get(row.sigla_provincia);
    const region = regions.get(row.codice_regione);
    requireValue(province && region && province.codice_regione === row.codice_regione, `${row.codice_istat}: missing or inconsistent relationship`);
    for (const key of ['denominazione_provincia', 'tipologia_provincia']) requireValue(row[key] === province[key], `${row.codice_istat}: inconsistent ${key}`);
    for (const key of ['denominazione_regione', 'tipologia_regione', 'ripartizione_geografica']) requireValue(row[key] === region[key], `${row.codice_istat}: inconsistent ${key}`);
    const identity = Object.fromEntries(schemas.gi_comuni_cap.filter((key) => key !== 'cap').map((key) => [key, row[key]]));
    const previous = municipalities.get(row.codice_istat);
    requireValue(!previous || JSON.stringify(previous) === JSON.stringify(identity), `${row.codice_istat}: inconsistent multi-CAP municipality`);
    municipalities.set(row.codice_istat, identity);
  }
  for (const province of provinces.values()) {
    requireValue(regions.has(province.codice_regione), `${province.sigla_provincia}: missing region`);
    requireValue([...municipalities.values()].filter((row) => row.sigla_provincia === province.sigla_provincia).length === +province.numero_comuni, `${province.sigla_provincia}: municipality count mismatch`);
  }
  for (const region of regions.values()) {
    requireValue([...provinces.values()].filter((row) => row.codice_regione === region.codice_regione).length === +region.numero_province, `${region.codice_regione}: province count mismatch`);
    requireValue([...municipalities.values()].filter((row) => row.codice_regione === region.codice_regione).length === +region.numero_comuni, `${region.codice_regione}: municipality count mismatch`);
  }
  return Object.fromEntries(tables.map((name) => [name, data[name].length]));
}

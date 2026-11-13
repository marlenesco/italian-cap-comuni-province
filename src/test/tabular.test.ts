import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as api from '../index';
import type { ComuneRaw, ProvinciaRaw, RegioneRaw } from '../types';
import { normalizeComuneData, normalizeProvinciaData, normalizeRegioneData } from '../utils/normalize';
import { loadComuni, loadProvince, loadRegioni } from '../utils/tabular';
import * as search from '../utils/search';

const read = (folder: string, name: string) => JSON.parse(readFileSync(`src/${folder}/${name}.json`, 'utf8'));
const rawComuni = read('data', 'gi_comuni_cap') as ComuneRaw[];
const comuni = rawComuni.map(normalizeComuneData);
const province = (read('data', 'gi_province') as ProvinciaRaw[]).map(normalizeProvinciaData);
const regioni = (read('data', 'gi_regioni') as RegioneRaw[]).map(normalizeRegioneData);

describe('Lossless tabular runtime data', () => {
  for (const name of ['gi_comuni_cap', 'gi_province', 'gi_regioni']) {
    it(`reconstructs every original field and row in ${name}`, () => {
      const source = read('data', name);
      const table = read('generated', name);
      expect(table.columns).toEqual(Object.keys(source[0]));
      expect(table.rows).toHaveLength(source.length);
      expect(table.rows.map((row: string[]) => Object.fromEntries(table.columns.map((key: string, i: number) => [key, row[i]])))).toStrictEqual(source);
    });
  }

  it('matches the original normalizers for every record, including undefined, numbers and booleans', () => {
    expect(loadComuni(read('generated', 'gi_comuni_cap'))).toStrictEqual(comuni);
    expect(loadProvince(read('generated', 'gi_province'))).toStrictEqual(province);
    expect(loadRegioni(read('generated', 'gi_regioni'))).toStrictEqual(regioni);
    expect(api.getAllComuni()).toStrictEqual(comuni);
    expect(comuni.some((row) => row.nomeAlternativo !== undefined)).toBe(true);
    expect(comuni.some((row) => row.nomeAlternativo === undefined)).toBe(true);
    expect(api.getAllProvince()).toStrictEqual([...province].sort((a, b) => a.nome.localeCompare(b.nome)));
    expect(api.getAllRegioni()).toStrictEqual([...regioni].sort((a, b) => a.nome.localeCompare(b.nome)));
  });

  it('handles empty and whitespace alternative names exactly like the raw normalizer', () => {
    for (const value of ['', '  ', rawComuni[0].denominazione_ita, 'Città/Über']) {
      const raw = { ...rawComuni[0], denominazione_ita_altra: value };
      expect(loadComuni({ columns: Object.keys(raw), rows: [Object.values(raw)] })).toStrictEqual([normalizeComuneData(raw)]);
    }
  });

  it('preserves column meaning when columns are reordered', () => {
    const table = read('generated', 'gi_comuni_cap');
    expect(loadComuni({ columns: [...table.columns].reverse(), rows: table.rows.map((row: string[]) => [...row].reverse()) })).toStrictEqual(comuni);
  });

  it('preserves every CAP group and the last-record ISTAT index semantics', () => {
    const byCap = new Map<string, typeof comuni>();
    const byCode = new Map<string, typeof comuni[number]>();
    for (const row of comuni) {
      if (!byCap.has(row.cap)) byCap.set(row.cap, []);
      byCap.get(row.cap)!.push(row);
      byCode.set(row.codiceIstat, row);
    }
    for (const [cap, rows] of byCap) expect(api.getComuniByCAP(` ${cap} `)).toStrictEqual(rows);
    for (const [code, row] of byCode) expect(api.getComuneByIstat(code)).toStrictEqual(row);
    expect(api.getComuniByCAP('25080').length).toBeGreaterThan(1);
    expect(api.getComuniByCAP('00118').length).toBeGreaterThan(0);
    expect(api.getComuneByIstat('028001')?.nome).toBe('Abano Terme');
    expect(api.getComuniByCAP('invalid')).toEqual([]);
    expect(api.getComuneByIstat('000000')).toBeUndefined();
  });

  for (const query of ['Milano', 'San', 'Bolzano/Bozen', 'Forlì', 'Forli', 'milano', 'zzz', '', '   ']) {
    for (const options of [{}, { exactMatch: true }, { caseSensitive: true, limit: 5 }, { soloCapoluoghi: true, limit: 10 }]) {
      it(`preserves search scores and ordering for ${JSON.stringify([query, options])}`, () => {
        expect(api.searchComuni(query, options)).toStrictEqual(search.searchComuni(comuni, query, options));
        expect(api.searchProvince(query, options)).toStrictEqual(search.searchProvince(province, query, options));
        expect(api.searchRegioni(query, options)).toStrictEqual(search.searchRegioni(regioni, query, options));
      });
    }
  }

  it('returns nonempty accented and alternative-name matches', () => {
    expect(api.searchComuni('Forli', { exactMatch: true }).some((r) => r.item.nome === 'Forlì')).toBe(true);
    expect(api.searchComuni('Bolzano/Bozen', { exactMatch: true }).some((r) => r.item.nome === 'Bolzano')).toBe(true);
  });

  for (const filters of [{ provincia: 'MI' }, { provincia: 'Milano', regione: 'Lombardia' }, { ripartizione: 'Sud' }, { soloCapoluoghi: true, regione: 'Lombardia' }]) {
    it(`preserves nonempty geographical filtering for ${JSON.stringify(filters)}`, () => {
      const expected = search.searchComuniWithFilters(comuni, 'a', filters);
      expect(expected.length).toBeGreaterThan(0);
      expect(api.searchComuniWithFilters('a', filters)).toStrictEqual(expected);
    });
  }

  it('preserves geographical groups, sorted lists and province/region lookups', () => {
    for (const row of province) {
      expect(api.getProvinciaBySigla(row.sigla.toLowerCase())).toStrictEqual(row);
      expect(api.getComuniByProvincia(row.sigla)).toStrictEqual(comuni.filter((c) => c.siglaProvincia === row.sigla));
    }
    for (const row of regioni) {
      expect(api.getRegioneByCode(row.codiceRegione)).toStrictEqual(row);
      expect(api.getComuniByRegione(row.nome)).toStrictEqual(comuni.filter((c) => c.nomeRegione === row.nome));
      const expected = province.filter((p) => p.codiceRegione === row.codiceRegione).sort((a, b) => a.nome.localeCompare(b.nome));
      expect(api.getProvinceByRegione(row.nome)).toStrictEqual(expected);
      expect(api.getProvinceByCodeRegione(row.codiceRegione)).toStrictEqual(expected);
    }
    expect(api.getCapoluoghi()).toStrictEqual(comuni.filter((c) => c.isCapoluogo));
    expect(api.default.getAllComuni()).toStrictEqual(comuni);
  });

  it('preserves existing deduplication, first-record helpers, CAP sorting and autocomplete', () => {
    const rows = comuni.filter((c) => c.codiceIstat === '015146');
    expect(rows.length).toBeGreaterThan(1);
    const caps = [...new Set(rows.map((c) => c.cap))].sort();
    expect(api.getCapsByComune('015146')).toStrictEqual(caps);
    expect(api.getCapsByComuneNome('Milano')).toStrictEqual([{ comune: rows[0], caps }]);
    expect(api.getComuneWithAllCaps('015146')).toStrictEqual({ comune: rows[0], caps });
    const unique = [...new Map(comuni.filter((c) => c.siglaProvincia === 'MI').slice().reverse().map((c) => [c.codiceIstat, c])).values()].sort((a, b) => a.nome.localeCompare(b.nome));
    expect(unique.length).toBeGreaterThan(0);
    expect(api.getComuniUniqueByProvincia('MI')).toStrictEqual(unique);
    for (const query of ['Mi', 'San', 'Forli', 'a', 'zzzz']) expect(api.getSuggestions(query, 5)).toStrictEqual(search.getSuggestionsComuni(comuni, query, 5));
    expect(api.getSuggestions('Mi', 5).length).toBeGreaterThan(0);
  });
});

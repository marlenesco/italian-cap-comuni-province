import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

type Table = { columns: string[]; rows: string[][] };
const original = JSON.parse(readFileSync('src/generated/gi_province.json', 'utf8')) as Table;

async function loadWithCategories(categories: Record<string, string>) {
  vi.resetModules();
  const sigla = original.columns.indexOf('sigla_provincia');
  const category = original.columns.indexOf('tipologia_provincia');
  const table = {
    columns: original.columns,
    rows: original.rows.map((row) => row.map((value, index) =>
      index === category && categories[row[sigla]] !== undefined ? categories[row[sigla]] : value)),
  };
  vi.doMock('../generated/gi_province.json', () => ({ default: table }));
  return import('../index');
}

afterEach(() => {
  vi.doUnmock('../generated/gi_province.json');
  vi.resetModules();
});

describe('Autonomous province category compatibility', () => {
  it.each([
    { name: 'the original spelling', BZ: 'Provincia autonoma', TN: 'Provincia autonoma' },
    { name: 'the Garda lowercase spelling', BZ: 'provincia autonoma', TN: 'provincia autonoma' },
    { name: 'uppercase categories', BZ: 'PROVINCIA AUTONOMA', TN: 'PROVINCIA AUTONOMA' },
    { name: 'mixed capitalization', BZ: 'PrOvInCiA AuToNoMa', TN: 'Provincia Autonoma' },
    { name: 'different casing between provinces', BZ: 'provincia autonoma', TN: 'Provincia autonoma' },
  ])('recognizes both provinces with $name without rewriting returned values', async ({ BZ, TN }) => {
    const api = await loadWithCategories({ BZ, TN });
    const provinces = api.getProvinceAutonome();
    expect(provinces.map((province) => province.sigla)).toEqual(['BZ', 'TN']);
    expect(provinces.map((province) => province.tipologia)).toEqual([BZ, TN]);
    expect(provinces[0]).toBe(api.getProvinciaBySigla('BZ'));
    expect(provinces[1]).toBe(api.getProvinciaBySigla('TN'));
    expect(api.getAllProvince().find((province) => province.sigla === 'BZ')?.tipologia).toBe(BZ);

    const combined = api.getRegioniAndProvinceAutonome();
    expect(combined.filter((item) => item.tipo === 'provincia_autonoma')).toEqual(provinces.map((province) => ({
      codice: province.sigla,
      nome: province.nome,
      sigla: province.sigla,
      tipo: 'provincia_autonoma',
      codiceRegione: province.codiceRegione,
    })));
    expect(combined.filter((item) => item.tipo === 'regione')).toHaveLength(api.getAllRegioni().length);
    expect(combined).toEqual([...combined].sort((a, b) => a.nome.localeCompare(b.nome)));
    expect(api.default.getProvinceAutonome()).toEqual(provinces);
    expect(api.default.getRegioniAndProvinceAutonome()).toEqual(combined);
  });

  it('excludes ordinary provinces and categories that only contain the expected text', async () => {
    const api = await loadWithCategories({ BZ: 'Provincia', TN: 'Provincia autonoma speciale' });
    expect(api.getProvinceAutonome()).toEqual([]);
    const combined = api.getRegioniAndProvinceAutonome();
    expect(combined).toHaveLength(api.getAllRegioni().length);
    expect(combined.every((item) => item.tipo === 'regione')).toBe(true);
  });
});

import type { Comune, ComuneRaw, Provincia, ProvinciaRaw, Regione, RegioneRaw } from '../types';

type Table = { columns: readonly string[]; rows: readonly (readonly string[])[] };

function columnIndices<T>(table: Table): Record<keyof T, number> {
  return Object.fromEntries(table.columns.map((name, index) => [name, index])) as Record<keyof T, number>;
}

// Column positions are resolved once; no intermediate raw objects are allocated.
export function loadComuni(table: Table): Comune[] {
  const c = columnIndices<ComuneRaw>(table);
  return table.rows.map((row) => ({
    codiceIstat: row[c.codice_istat],
    nome: row[c.denominazione_ita],
    nomeAlternativo: row[c.denominazione_ita_altra] !== row[c.denominazione_ita]
      && row[c.denominazione_ita_altra].trim() !== '' ? row[c.denominazione_ita_altra] : undefined,
    cap: row[c.cap],
    siglaProvincia: row[c.sigla_provincia],
    nomeProvincia: row[c.denominazione_provincia],
    tipologiaProvincia: row[c.tipologia_provincia],
    codiceRegione: row[c.codice_regione],
    nomeRegione: row[c.denominazione_regione],
    tipologiaRegione: row[c.tipologia_regione],
    ripartizioneGeografica: row[c.ripartizione_geografica],
    isCapoluogo: row[c.flag_capoluogo] === 'SI',
    codiceBelfiore: row[c.codice_belfiore],
    coordinate: { lat: parseFloat(row[c.lat]), lng: parseFloat(row[c.lon]) },
    superficie: parseFloat(row[c.superficie_kmq]),
  }));
}

export function loadProvince(table: Table): Provincia[] {
  const c = columnIndices<ProvinciaRaw>(table);
  return table.rows.map((row) => ({
    codiceRegione: row[c.codice_regione],
    sigla: row[c.sigla_provincia],
    nome: row[c.denominazione_provincia],
    tipologia: row[c.tipologia_provincia],
    numeroComuni: parseInt(row[c.numero_comuni], 10),
    superficie: parseFloat(row[c.superficie_kmq]),
    codiceSovracomunale: row[c.codice_sovracomunale],
  }));
}

export function loadRegioni(table: Table): Regione[] {
  const c = columnIndices<RegioneRaw>(table);
  return table.rows.map((row) => ({
    codiceRegione: row[c.codice_regione],
    nome: row[c.denominazione_regione],
    tipologia: row[c.tipologia_regione],
    ripartizioneGeografica: row[c.ripartizione_geografica],
    numeroProvince: parseInt(row[c.numero_province], 10),
    numeroComuni: parseInt(row[c.numero_comuni], 10),
    superficie: parseFloat(row[c.superficie_kmq]),
  }));
}

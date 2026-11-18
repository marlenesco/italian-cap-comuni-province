import { describe, expect, it } from 'vitest';
import { hasCAP } from '../cap';
import { getComuniByCAP, isValidCAP } from '../index';
import records from '../data/gi_comuni_cap.json';
import postalCodes from '../generated/cap.json';

describe('Postal-code dataset membership', () => {
  it('ships exactly the sorted unique CAPs without municipality records', () => {
    expect(postalCodes).toEqual([...new Set(records.map((record) => record.cap))].sort());
  });

  it('matches the source dataset for every five-digit value', () => {
    const expected = new Set(records.map((record) => record.cap));
    for (let number = 0; number < 100_000; number++) {
      const cap = String(number).padStart(5, '0');
      expect(hasCAP(cap), cap).toBe(expected.has(cap));
    }
  });

  it.each(['00118', '35031', '98168', '00000', '99999', '00100', '20100'])(
    'agrees with the full lookup for %s',
    (cap) => expect(hasCAP(cap)).toBe(getComuniByCAP(cap).length > 0),
  );

  it('trims surrounding whitespace without dropping leading zeros', () => {
    expect(hasCAP(' \t00118\n')).toBe(true);
    expect(hasCAP('118')).toBe(false);
    expect(hasCAP(' 99999 ')).toBe(false);
  });

  it.each(['', ' ', '0011', '000118', '+00118', '00118x', '00 118', '00118\n99999', '１２３４５'])(
    'rejects malformed postal code %j',
    (cap) => expect(hasCAP(cap)).toBe(false),
  );

  it('keeps dataset membership distinct from legacy format/range validation', () => {
    expect(isValidCAP('20100')).toBe(true);
    expect(hasCAP('20100')).toBe(false);
  });
});

import postalCodes from './generated/cap.json';

const knownCAPs = new Set(postalCodes);

/**
 * Check membership in the bundled postal-code dataset, preserving leading zeros.
 * This does not determine business coverage or accept absent legacy/generic CAPs.
 */
export function hasCAP(cap: string): boolean {
  return knownCAPs.has(cap.trim());
}

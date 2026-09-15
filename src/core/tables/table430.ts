/**
 * NEC 2023 Table 430.250 — Full-Load Current, Three-Phase AC Motors.
 * Cross-verified across 4 independent sources with identical values —
 * high confidence, standard "unverified transcription" banner still applies.
 *
 * Table 430.251(A)/(B) — Locked-Rotor Current — is DELIBERATELY NOT
 * populated. Locked-rotor tables were not returned with sufficient
 * cross-source agreement to trust in this research pass, and this data
 * feeds directly into motor-starting voltage-dip calculations that a PE
 * would use for equipment protection decisions. Per the "No fabrication"
 * rule, any attempt to look up an LRA value throws. This BLOCKS validation
 * case V4 until Table 430.251 is keyed from the physical codebook.
 */

import { OutOfTableRangeError, UnverifiedTableValueError } from '../domain/errors';

export type MotorVoltage = 115 | 200 | 208 | 230 | 460 | 575;

export const TABLE_430_250: Record<string, Partial<Record<MotorVoltage, number>>> = {
  '0.5': { 115: 4.4, 200: 2.5, 208: 2.4, 230: 2.2, 460: 1.1, 575: 0.9 },
  '0.75': { 115: 6.4, 200: 3.7, 208: 3.5, 230: 3.2, 460: 1.6, 575: 1.3 },
  '1': { 115: 8.4, 200: 4.8, 208: 4.6, 230: 4.2, 460: 2.1, 575: 1.7 },
  '1.5': { 115: 12, 200: 6.9, 208: 6.6, 230: 6.0, 460: 3.0, 575: 2.1 },
  '2': { 115: 13.6, 200: 7.8, 208: 7.5, 230: 6.8, 460: 3.4, 575: 2.7 },
  '3': { 200: 11, 208: 10.6, 230: 9.6, 460: 4.8, 575: 3.9 },
  '5': { 200: 17.5, 208: 16.7, 230: 15.2, 460: 7.6, 575: 6.1 },
  '7.5': { 200: 25.3, 208: 24.2, 230: 22, 460: 11, 575: 9 },
  '10': { 200: 32.2, 208: 30.8, 230: 28, 460: 14, 575: 11 },
  '15': { 200: 48.3, 208: 46.2, 230: 42, 460: 21, 575: 17 },
  '20': { 200: 62.1, 208: 59.4, 230: 54, 460: 27, 575: 22 },
  '25': { 200: 78.2, 208: 74.8, 230: 68, 460: 34, 575: 27 },
  '30': { 200: 92, 208: 88, 230: 80, 460: 40, 575: 32 },
  '40': { 200: 120, 208: 114, 230: 104, 460: 52, 575: 41 },
  '50': { 200: 150, 208: 143, 230: 130, 460: 65, 575: 52 },
  '60': { 200: 177, 208: 169, 230: 154, 460: 77, 575: 62 },
  '75': { 200: 221, 208: 211, 230: 192, 460: 96, 575: 77 },
  '100': { 200: 285, 208: 273, 230: 248, 460: 124, 575: 99 },
};

export function lookupMotorFlc(hp: string, voltage: MotorVoltage): number {
  const row = TABLE_430_250[hp];
  if (!row) throw new OutOfTableRangeError('NEC Table 430.250', `HP '${hp}' not in verified subset`);
  const val = row[voltage];
  if (val === undefined) throw new OutOfTableRangeError('NEC Table 430.250', `HP '${hp}' at ${voltage}V not tabulated (check voltage class)`);
  return val;
}

/**
 * BLOCKED: Table 430.251 (locked-rotor current) not populated.
 * Calling this always throws — this is intentional, not a bug.
 */
export function lookupMotorLra(_hp: string, _voltage: MotorVoltage): number {
  throw new UnverifiedTableValueError(
    'NEC Table 430.251 (locked-rotor current)',
    `HP '${_hp}' at ${_voltage}V`,
    'Enter nameplate LRA directly, or verify Table 430.251(A)/(B) against the physical NFPA 70 text and populate this table before using computed LRA in a motor-starting study.'
  );
}

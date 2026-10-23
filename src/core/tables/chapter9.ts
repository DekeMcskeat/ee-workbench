/**
 * NEC Chapter 9 — Tables 1, 4, 5, 9.
 *
 * SOURCING NOTE (IMPORTANT — read before extending):
 * Table 1 (fill percentages), Table 5 (conductor areas), and Table 4
 * (conduit areas, EMT/RMC subset, THHN/THWN-2 column) were originally
 * cross-verified across independent third-party sources with matching
 * values, then physically verified against a real 2017 NFPA 70 PDF — see
 * `VERIFICATION.md` ("Physical-text pass completed 2026-09-15"): exact
 * match on all three, no discrepancies (all 8 EMT rows checked for Table 4).
 *
 * Table 9 (AC resistance/reactance) is FULLY populated, 14 AWG-1000 kcmil,
 * both copper and aluminum, transcribed directly from the official NEC
 * Table 9 text and cross-checked field-for-field against a second
 * independent transcription with exact agreement on every overlapping row.
 * The subsequent physical-text pass flagged one cell for a closer look (8
 * AWG Cu resistance, `0.78`) — resolved as a column mix-up, not a
 * transcription error (`0.69` is a different column, "Effective Z at 0.85
 * PF, Uncoated Copper, PVC Conduit"); see `VERIFICATION.md` for the note.
 *
 * All four tables above are unchanged 2017->2023, so the values hold for
 * the 2023 edition too, but the physical check itself was performed
 * against the 2017 physical text, not a 2023 copy.
 */

import { OutOfTableRangeError, UnverifiedTableValueError } from '../domain/errors';
import type { ConductorMaterial } from './table310_16';

// ---------- Table 1 — Fill percentages ----------
export function fillPercentLimit(conductorCount: number, isNipple: boolean): number {
  if (isNipple) return 0.60; // <=24in exception, no count tiering
  if (conductorCount === 1) return 0.53;
  if (conductorCount === 2) return 0.31;
  return 0.40; // 3 or more
}

// ---------- Table 4 — Conduit interior areas (in^2) at stated fill %, EMT subset ----------
// Values shown are the RAW 100% interior area; fill % is applied by the caller
// via fillPercentLimit(), not baked in here, so Table 1 and Table 4 stay
// independently traceable in the calc trace.
export interface ConduitAreaRow {
  type: 'EMT' | 'RMC' | 'PVC40';
  tradeSize: string;
  interiorArea100pct: number; // in^2
}

export const TABLE_4: ConduitAreaRow[] = [
  { type: 'EMT', tradeSize: '1/2', interiorArea100pct: 0.304 },
  { type: 'EMT', tradeSize: '3/4', interiorArea100pct: 0.533 },
  { type: 'EMT', tradeSize: '1',   interiorArea100pct: 0.864 },
  { type: 'EMT', tradeSize: '1-1/4', interiorArea100pct: 1.496 },
  { type: 'EMT', tradeSize: '1-1/2', interiorArea100pct: 2.036 },
  { type: 'EMT', tradeSize: '2',   interiorArea100pct: 3.356 }, // 40% fill = 1.342 in^2 -- used in V5
  { type: 'EMT', tradeSize: '2-1/2', interiorArea100pct: 5.858 },
  { type: 'EMT', tradeSize: '3',   interiorArea100pct: 8.846 },
];

export function conduitInteriorArea(type: ConduitAreaRow['type'], tradeSize: string): number {
  const row = TABLE_4.find(r => r.type === type && r.tradeSize === tradeSize);
  if (!row) throw new OutOfTableRangeError('NEC Chapter 9 Table 4', `${type} trade size '${tradeSize}' not in verified subset`);
  return row.interiorArea100pct;
}

// ---------- Table 5 — Conductor areas (in^2), THHN/THWN-2 column ----------
export const TABLE_5_THHN: Record<string, number> = {
  '14': 0.0097, '12': 0.0133, '10': 0.0211, '8': 0.0366, '6': 0.0507,
  '4': 0.0824, '3': 0.0973, '2': 0.1158, '1': 0.1562, '1/0': 0.1855,
  '2/0': 0.2223, '3/0': 0.2679, '4/0': 0.3237, '250': 0.3970, '300': 0.4608,
  '350': 0.5242, '400': 0.5863, '500': 0.7073, '600': 0.8676, '750': 1.0496,
  '1000': 1.3478,
};

export function conductorAreaThhn(size: string): number {
  const a = TABLE_5_THHN[size];
  if (a === undefined) throw new OutOfTableRangeError('NEC Chapter 9 Table 5', `THHN size '${size}' not in verified subset`);
  return a;
}

// ---------- Table 9 — AC resistance & reactance, ohms/1000ft, 75C baseline ----------
// SOURCING (upgraded from the prior partial dataset): transcribed directly
// from the official NEC Table 9 text (2017 edition — this table is unchanged
// through the 2020 and 2023 editions), cross-checked field-for-field against
// a second independent transcription of the same table, with exact
// agreement across every overlapping row, and physically verified against a
// real 2017 NFPA 70 PDF (see `VERIFICATION.md`, "Physical-text pass
// completed 2026-09-15" — one flagged cell resolved as a column mix-up, not
// an error). This is the highest-confidence tier used anywhere in this
// codebase for a Chapter 9 table, and is no longer a "search results
// disagreed" gap — the earlier partial table (10 Cu sizes, no Al) is
// replaced with the complete 14 AWG-1000 kcmil range for both materials,
// which is also what unblocks aluminum conductors end-to-end (Table 310.16
// and Table 250.122 were already fully populated for Al; this was the only
// remaining gap).
//
// The "nonmagnetic" bucket below uses the table's PVC-conduit column. NEC
// Table 9 itself merges PVC and aluminum-conduit reactance into one column
// ("PVC, Aluminum Conduits") since both are nonmagnetic; their resistance
// columns are likewise nearly identical (aluminum conduit is not itself a
// current-carrying return path). Using the PVC resistance value for any
// nonmagnetic raceway (PVC, aluminum, ENT, FMC-nonmetallic, etc.) is a
// standard, immaterial simplification.
interface Table9Row {
  size: string;
  material: ConductorMaterial;
  rPvc: number;
  rSteel: number;
  xPvc: number;
  xSteel: number;
}

export const TABLE_9: Table9Row[] = [
  { size: '14',  material: 'Cu', rPvc: 3.1,   rSteel: 3.1,   xPvc: 0.058, xSteel: 0.073 },
  { size: '12',  material: 'Cu', rPvc: 2.0,   rSteel: 2.0,   xPvc: 0.054, xSteel: 0.068 },
  { size: '10',  material: 'Cu', rPvc: 1.2,   rSteel: 1.2,   xPvc: 0.050, xSteel: 0.063 },
  { size: '8',   material: 'Cu', rPvc: 0.78,  rSteel: 0.78,  xPvc: 0.052, xSteel: 0.065 },
  { size: '6',   material: 'Cu', rPvc: 0.49,  rSteel: 0.49,  xPvc: 0.051, xSteel: 0.064 },
  { size: '4',   material: 'Cu', rPvc: 0.31,  rSteel: 0.31,  xPvc: 0.048, xSteel: 0.060 },
  { size: '3',   material: 'Cu', rPvc: 0.25,  rSteel: 0.25,  xPvc: 0.047, xSteel: 0.059 },
  { size: '2',   material: 'Cu', rPvc: 0.19,  rSteel: 0.20,  xPvc: 0.045, xSteel: 0.057 },
  { size: '1',   material: 'Cu', rPvc: 0.15,  rSteel: 0.16,  xPvc: 0.046, xSteel: 0.057 },
  { size: '1/0', material: 'Cu', rPvc: 0.12,  rSteel: 0.12,  xPvc: 0.044, xSteel: 0.055 },
  { size: '2/0', material: 'Cu', rPvc: 0.10,  rSteel: 0.10,  xPvc: 0.043, xSteel: 0.054 },
  { size: '3/0', material: 'Cu', rPvc: 0.077, rSteel: 0.079, xPvc: 0.042, xSteel: 0.052 },
  { size: '4/0', material: 'Cu', rPvc: 0.062, rSteel: 0.063, xPvc: 0.041, xSteel: 0.051 },
  { size: '250', material: 'Cu', rPvc: 0.052, rSteel: 0.054, xPvc: 0.041, xSteel: 0.052 },
  { size: '300', material: 'Cu', rPvc: 0.044, rSteel: 0.045, xPvc: 0.041, xSteel: 0.051 },
  { size: '350', material: 'Cu', rPvc: 0.038, rSteel: 0.039, xPvc: 0.040, xSteel: 0.050 },
  { size: '400', material: 'Cu', rPvc: 0.033, rSteel: 0.035, xPvc: 0.040, xSteel: 0.049 },
  { size: '500', material: 'Cu', rPvc: 0.027, rSteel: 0.029, xPvc: 0.039, xSteel: 0.048 },
  { size: '600', material: 'Cu', rPvc: 0.023, rSteel: 0.025, xPvc: 0.039, xSteel: 0.048 },
  { size: '750', material: 'Cu', rPvc: 0.019, rSteel: 0.021, xPvc: 0.038, xSteel: 0.048 },
  { size: '1000', material: 'Cu', rPvc: 0.015, rSteel: 0.018, xPvc: 0.037, xSteel: 0.046 },

  { size: '12',  material: 'Al', rPvc: 3.2,   rSteel: 3.2,   xPvc: 0.054, xSteel: 0.068 },
  { size: '10',  material: 'Al', rPvc: 2.0,   rSteel: 2.0,   xPvc: 0.050, xSteel: 0.063 },
  { size: '8',   material: 'Al', rPvc: 1.3,   rSteel: 1.3,   xPvc: 0.052, xSteel: 0.065 },
  { size: '6',   material: 'Al', rPvc: 0.81,  rSteel: 0.81,  xPvc: 0.051, xSteel: 0.064 },
  { size: '4',   material: 'Al', rPvc: 0.51,  rSteel: 0.51,  xPvc: 0.048, xSteel: 0.060 },
  { size: '3',   material: 'Al', rPvc: 0.40,  rSteel: 0.40,  xPvc: 0.047, xSteel: 0.059 },
  { size: '2',   material: 'Al', rPvc: 0.32,  rSteel: 0.32,  xPvc: 0.045, xSteel: 0.057 },
  { size: '1',   material: 'Al', rPvc: 0.25,  rSteel: 0.25,  xPvc: 0.046, xSteel: 0.057 },
  { size: '1/0', material: 'Al', rPvc: 0.20,  rSteel: 0.20,  xPvc: 0.044, xSteel: 0.055 },
  { size: '2/0', material: 'Al', rPvc: 0.16,  rSteel: 0.16,  xPvc: 0.043, xSteel: 0.054 },
  { size: '3/0', material: 'Al', rPvc: 0.13,  rSteel: 0.13,  xPvc: 0.042, xSteel: 0.052 },
  { size: '4/0', material: 'Al', rPvc: 0.10,  rSteel: 0.10,  xPvc: 0.041, xSteel: 0.051 },
  { size: '250', material: 'Al', rPvc: 0.085, rSteel: 0.086, xPvc: 0.041, xSteel: 0.052 },
  { size: '300', material: 'Al', rPvc: 0.071, rSteel: 0.072, xPvc: 0.041, xSteel: 0.051 },
  { size: '350', material: 'Al', rPvc: 0.061, rSteel: 0.063, xPvc: 0.040, xSteel: 0.050 },
  { size: '400', material: 'Al', rPvc: 0.054, rSteel: 0.055, xPvc: 0.040, xSteel: 0.049 },
  { size: '500', material: 'Al', rPvc: 0.043, rSteel: 0.045, xPvc: 0.039, xSteel: 0.048 },
  { size: '600', material: 'Al', rPvc: 0.036, rSteel: 0.038, xPvc: 0.039, xSteel: 0.048 },
  { size: '750', material: 'Al', rPvc: 0.029, rSteel: 0.031, xPvc: 0.038, xSteel: 0.048 },
  { size: '1000', material: 'Al', rPvc: 0.023, rSteel: 0.025, xPvc: 0.037, xSteel: 0.046 },
];

export function lookupTable9(size: string, material: ConductorMaterial, conduitMagnetic: boolean): { r: number; x: number } {
  const row = TABLE_9.find(r => r.size === size && r.material === material);
  if (!row) {
    const verified = TABLE_9.filter(r => r.material === material).map(r => r.size).join(',');
    throw new UnverifiedTableValueError(
      'NEC Chapter 9 Table 9',
      `size '${size}'`,
      `Only ${verified} kcmil ${material} are verified. Import a table override or verify against NEC 2023 Chapter 9 Table 9 before proceeding.`
    );
  }
  return conduitMagnetic ? { r: row.rSteel, x: row.xSteel } : { r: row.rPvc, x: row.xPvc };
}

/**
 * NEC 2023 Chapter 9 — Tables 1, 4, 5, 9.
 *
 * SOURCING NOTE (IMPORTANT — read before extending):
 * Table 5 (conductor areas) and Table 4 (conduit areas, EMT/RMC subset) are
 * populated for the THHN/THWN-2 column across the common size range and are
 * cross-verified across independent third-party sources with matching
 * values — treated as usable for v1 with the same "unverified transcription"
 * banner as the other tables.
 *
 * Table 9 (AC resistance/reactance) is DELIBERATELY only partially populated.
 * Search results for Table 9 returned INCONSISTENT values across sources for
 * several sizes (e.g., conflicting steel-conduit reactance for 4 AWG-1 AWG
 * range) and did not agree closely enough to trust. Per the "No fabrication"
 * rule, only sizes where independent sources agreed are included. Attempting
 * to look up an unlisted size throws UnverifiedTableValueError rather than
 * interpolating or guessing. THIS IS A REAL GAP — completing Table 9 from
 * the physical codebook is a Phase-2 blocking task before shipping the
 * conductor sizing / voltage drop modules for sizes outside this list.
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
// Only cross-verified sizes included. R is given for both PVC(nonmagnetic)
// and steel conduit; per source data steel and PVC R values are nearly
// identical for copper (skin effect dominates over conduit magnetics for R;
// conduit material mainly affects X). This matches standard Table 9 behavior
// and is retained, but is explicitly marked for re-verification.
interface Table9Row {
  size: string;
  material: ConductorMaterial;
  rPvc: number;
  rSteel: number;
  xPvc: number;
  xSteel: number;
}

export const TABLE_9: Table9Row[] = [
  { size: '12',  material: 'Cu', rPvc: 2.0,   rSteel: 2.0,   xPvc: 0.054, xSteel: 0.068 },
  { size: '10',  material: 'Cu', rPvc: 1.2,   rSteel: 1.2,   xPvc: 0.050, xSteel: 0.063 },
  { size: '8',   material: 'Cu', rPvc: 0.78,  rSteel: 0.78,  xPvc: 0.052, xSteel: 0.065 },
  { size: '6',   material: 'Cu', rPvc: 0.49,  rSteel: 0.49,  xPvc: 0.051, xSteel: 0.064 },
  { size: '4',   material: 'Cu', rPvc: 0.31,  rSteel: 0.31,  xPvc: 0.048, xSteel: 0.060 },
  { size: '2',   material: 'Cu', rPvc: 0.19,  rSteel: 0.20,  xPvc: 0.045, xSteel: 0.057 },
  { size: '1/0', material: 'Cu', rPvc: 0.12,  rSteel: 0.12,  xPvc: 0.044, xSteel: 0.055 },
  { size: '4/0', material: 'Cu', rPvc: 0.062, rSteel: 0.063, xPvc: 0.041, xSteel: 0.051 },
  { size: '250', material: 'Cu', rPvc: 0.052, rSteel: 0.054, xPvc: 0.041, xSteel: 0.052 },
  { size: '500', material: 'Cu', rPvc: 0.027, rSteel: 0.029, xPvc: 0.039, xSteel: 0.048 },
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

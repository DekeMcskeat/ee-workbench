/**
 * NEC 2023 Table 310.15(B)(1) — Ambient Temperature Correction Factors
 * NEC 2023 Table 310.15(C)(1) — Adjustment Factors for More Than 3 CCC
 *
 * SOURCING NOTE: same caveat as table310_16.ts — third-party transcription,
 * internally cross-checked across 3 independent sources with identical
 * values, but not yet verified against the physical NFPA 70 text by this
 * build. Flag in UI as "unverified transcription" until a verification pass.
 */

import { OutOfTableRangeError } from '../domain/errors';
import type { TempRating } from './table310_16';

interface TempBand {
  minC: number;
  maxC: number; // inclusive
  factor: Record<TempRating, number>;
}

export const TABLE_310_15_B1: TempBand[] = [
  { minC: -Infinity, maxC: 10, factor: { 60: 1.29, 75: 1.20, 90: 1.15 } },
  { minC: 11, maxC: 15, factor: { 60: 1.22, 75: 1.15, 90: 1.12 } },
  { minC: 16, maxC: 20, factor: { 60: 1.15, 75: 1.11, 90: 1.08 } },
  { minC: 21, maxC: 25, factor: { 60: 1.08, 75: 1.05, 90: 1.04 } },
  { minC: 26, maxC: 30, factor: { 60: 1.00, 75: 1.00, 90: 1.00 } },
  { minC: 31, maxC: 35, factor: { 60: 0.91, 75: 0.94, 90: 0.96 } },
  { minC: 36, maxC: 40, factor: { 60: 0.82, 75: 0.88, 90: 0.91 } },
  { minC: 41, maxC: 45, factor: { 60: 0.71, 75: 0.82, 90: 0.87 } },
  { minC: 46, maxC: 50, factor: { 60: 0.58, 75: 0.75, 90: 0.82 } },
  { minC: 51, maxC: 55, factor: { 60: 0.41, 75: 0.67, 90: 0.76 } },
  { minC: 56, maxC: 60, factor: { 60: NaN,  75: 0.58, 90: 0.71 } },
  { minC: 61, maxC: 65, factor: { 60: NaN,  75: 0.47, 90: 0.65 } },
  { minC: 66, maxC: 70, factor: { 60: NaN,  75: 0.33, 90: 0.58 } },
  { minC: 71, maxC: 75, factor: { 60: NaN,  75: NaN,  90: 0.50 } },
  { minC: 76, maxC: 80, factor: { 60: NaN,  75: NaN,  90: 0.41 } },
  { minC: 81, maxC: 85, factor: { 60: NaN,  75: NaN,  90: 0.29 } },
];

export function ambientCorrectionFactor(ambientC: number, tempRating: TempRating): number {
  const band = TABLE_310_15_B1.find(b => ambientC >= b.minC && ambientC <= b.maxC);
  if (!band) {
    throw new OutOfTableRangeError('NEC Table 310.15(B)(1)', `ambient ${ambientC}°C exceeds tabulated range (max 85°C)`);
  }
  const f = band.factor[tempRating];
  if (Number.isNaN(f)) {
    throw new OutOfTableRangeError(
      'NEC Table 310.15(B)(1)',
      `no correction factor tabulated for ${tempRating}°C insulation at ${ambientC}°C ambient — conductor is not rated for use at this ambient`
    );
  }
  return f;
}

interface CccBand {
  minCount: number;
  maxCount: number;
  factor: number;
}

export const TABLE_310_15_C1: CccBand[] = [
  { minCount: 1, maxCount: 3, factor: 1.00 },
  { minCount: 4, maxCount: 6, factor: 0.80 },
  { minCount: 7, maxCount: 9, factor: 0.70 },
  { minCount: 10, maxCount: 20, factor: 0.50 },
  { minCount: 21, maxCount: 30, factor: 0.45 },
  { minCount: 31, maxCount: 40, factor: 0.40 },
  { minCount: 41, maxCount: Infinity, factor: 0.35 },
];

export function cccAdjustmentFactor(cccCount: number): number {
  if (cccCount < 1) throw new OutOfTableRangeError('NEC Table 310.15(C)(1)', `CCC count must be >= 1, got ${cccCount}`);
  const band = TABLE_310_15_C1.find(b => cccCount >= b.minCount && cccCount <= b.maxCount);
  if (!band) throw new OutOfTableRangeError('NEC Table 310.15(C)(1)', `CCC count ${cccCount} not tabulated`);
  return band.factor;
}

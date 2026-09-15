/**
 * NEC 2023 Table 310.16 — Allowable ampacities of insulated conductors,
 * rated 0-2000V, 60C-90C, not more than 3 CCC in raceway/cable, 30C ambient.
 *
 * SOURCING NOTE: transcribed from multiple third-party electrical-reference
 * aggregators (cross-checked against each other for internal consistency),
 * NOT against the physical NFPA 70 codebook directly by this build process.
 * Standard practice for a real ship: re-key this table from the NFPA 70
 * PDF/print edition with a second-person verification pass before this
 * dataset is marked "verified" in the Standards settings screen.
 * Until that pass happens, the UI must show a "Table source: unverified
 * third-party transcription — confirm against your code book" banner
 * wherever 310.16 values are displayed. This is a REAL gap, not a formality.
 *
 * Structure allows edition-versioning per the "Versioned rule sets" requirement.
 */

import { OutOfTableRangeError } from '../domain/errors';

export type ConductorMaterial = 'Cu' | 'Al';
export type TempRating = 60 | 75 | 90;

export interface AmpacityRow {
  size: string; // canonical size key, e.g. "12", "1/0", "250" (kcmil implied above 4/0)
  cu: Record<TempRating, number>;
  al: Record<TempRating, number>;
}

export const TABLE_310_16_2023: AmpacityRow[] = [
  { size: '14',  cu: { 60: 15, 75: 20, 90: 25 }, al: { 60: 0,   75: 0,   90: 0   } },
  { size: '12',  cu: { 60: 20, 75: 25, 90: 30 }, al: { 60: 15,  75: 20,  90: 25  } },
  { size: '10',  cu: { 60: 30, 75: 35, 90: 40 }, al: { 60: 25,  75: 30,  90: 35  } },
  { size: '8',   cu: { 60: 40, 75: 50, 90: 55 }, al: { 60: 35,  75: 40,  90: 45  } },
  { size: '6',   cu: { 60: 55, 75: 65, 90: 75 }, al: { 60: 40,  75: 50,  90: 55  } },
  { size: '4',   cu: { 60: 70, 75: 85, 90: 95 }, al: { 60: 55,  75: 65,  90: 75  } },
  { size: '3',   cu: { 60: 85, 75: 100, 90: 115 }, al: { 60: 65,  75: 75,  90: 85  } },
  { size: '2',   cu: { 60: 95, 75: 115, 90: 130 }, al: { 60: 75,  75: 90,  90: 100 } },
  { size: '1',   cu: { 60: 110, 75: 130, 90: 145 }, al: { 60: 85,  75: 100, 90: 115 } },
  { size: '1/0', cu: { 60: 125, 75: 150, 90: 170 }, al: { 60: 100, 75: 120, 90: 135 } },
  { size: '2/0', cu: { 60: 145, 75: 175, 90: 195 }, al: { 60: 115, 75: 135, 90: 150 } },
  { size: '3/0', cu: { 60: 165, 75: 200, 90: 225 }, al: { 60: 130, 75: 155, 90: 175 } },
  { size: '4/0', cu: { 60: 195, 75: 230, 90: 260 }, al: { 60: 150, 75: 180, 90: 205 } },
  { size: '250', cu: { 60: 215, 75: 255, 90: 290 }, al: { 60: 170, 75: 205, 90: 230 } },
  { size: '300', cu: { 60: 240, 75: 285, 90: 320 }, al: { 60: 195, 75: 230, 90: 260 } },
  { size: '350', cu: { 60: 260, 75: 310, 90: 350 }, al: { 60: 210, 75: 250, 90: 280 } },
  { size: '400', cu: { 60: 280, 75: 335, 90: 380 }, al: { 60: 225, 75: 270, 90: 305 } },
  { size: '500', cu: { 60: 320, 75: 380, 90: 430 }, al: { 60: 260, 75: 310, 90: 350 } },
  { size: '600', cu: { 60: 350, 75: 420, 90: 475 }, al: { 60: 285, 75: 340, 90: 385 } },
  { size: '750', cu: { 60: 400, 75: 475, 90: 535 }, al: { 60: 320, 75: 385, 90: 435 } },
  { size: '1000',cu: { 60: 455, 75: 545, 90: 615 }, al: { 60: 375, 75: 445, 90: 500 } },
];

/** Ordered sizes for the "upsize and repeat" iteration in conductor sizing. */
export const SIZE_ORDER = TABLE_310_16_2023.map(r => r.size);

export function lookupAmpacity(
  size: string,
  material: ConductorMaterial,
  tempRating: TempRating
): number {
  const row = TABLE_310_16_2023.find(r => r.size === size);
  if (!row) {
    throw new OutOfTableRangeError('NEC Table 310.16', `size '${size}' not found (smallest=14 AWG, largest=1000 kcmil)`);
  }
  const val = material === 'Cu' ? row.cu[tempRating] : row.al[tempRating];
  if (val === 0) {
    throw new OutOfTableRangeError('NEC Table 310.16', `aluminum not tabulated below 12 AWG for size '${size}'`);
  }
  return val;
}

export function nextSizeUp(currentSize: string): string {
  const idx = SIZE_ORDER.indexOf(currentSize);
  if (idx === -1) throw new OutOfTableRangeError('NEC Table 310.16', `size '${currentSize}' not found for upsize`);
  if (idx === SIZE_ORDER.length - 1) {
    throw new OutOfTableRangeError('NEC Table 310.16', `already at largest tabulated size (1000 kcmil) — parallel conductors required`);
  }
  return SIZE_ORDER[idx + 1];
}

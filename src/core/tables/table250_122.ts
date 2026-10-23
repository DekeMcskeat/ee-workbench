/**
 * NEC Table 250.122 — Minimum size Equipment Grounding Conductors.
 * Keyed by OCPD rating (round UP to next listed row, per code note).
 * SOURCING NOTE: originally a third-party transcription, cross-verified
 * across 5 independent sources with identical values through 1200A;
 * physically verified against a real 2017 NFPA 70 PDF — see
 * `VERIFICATION.md` ("Physical-text pass completed 2026-09-15"): exact
 * match, no discrepancies. This table is unchanged 2017->2023, so the
 * values hold for the 2023 edition too, but the check itself was performed
 * against the 2017 physical text, not a 2023 copy.
 */

import { OutOfTableRangeError } from '../domain/errors';

interface EgcRow {
  maxOcpdAmps: number;
  cuSize: string; // AWG or "xxx kcmil"
  cuCmil: number; // circular mils, for 250.122(B) proportional upsizing
  alSize: string;
  alCmil: number;
}

// Circular mil reference (Chapter 9 Table 8, uncoated copper solid/stranded — standard AWG cmil values)
export const AWG_CMIL: Record<string, number> = {
  '14': 4110, '12': 6530, '10': 10380, '8': 16510, '6': 26240, '4': 41740,
  '3': 52620, '2': 66360, '1': 83690, '1/0': 105600, '2/0': 133100,
  '3/0': 167800, '4/0': 211600, '250': 250000, '300': 300000, '350': 350000,
  '400': 400000, '500': 500000, '600': 600000, '700': 700000, '750': 750000,
  '800': 800000, '900': 900000, '1000': 1000000,
};

export const TABLE_250_122: EgcRow[] = [
  { maxOcpdAmps: 15,   cuSize: '14',  cuCmil: 4110,   alSize: '12',  alCmil: 6530 },
  { maxOcpdAmps: 20,   cuSize: '12',  cuCmil: 6530,   alSize: '10',  alCmil: 10380 },
  { maxOcpdAmps: 60,   cuSize: '10',  cuCmil: 10380,  alSize: '8',   alCmil: 16510 },
  { maxOcpdAmps: 100,  cuSize: '8',   cuCmil: 16510,  alSize: '6',   alCmil: 26240 },
  { maxOcpdAmps: 200,  cuSize: '6',   cuCmil: 26240,  alSize: '4',   alCmil: 41740 },
  { maxOcpdAmps: 300,  cuSize: '4',   cuCmil: 41740,  alSize: '2',   alCmil: 66360 },
  { maxOcpdAmps: 400,  cuSize: '3',   cuCmil: 52620,  alSize: '1',   alCmil: 83690 },
  { maxOcpdAmps: 500,  cuSize: '2',   cuCmil: 66360,  alSize: '1/0', alCmil: 105600 },
  { maxOcpdAmps: 600,  cuSize: '1',   cuCmil: 83690,  alSize: '2/0', alCmil: 133100 },
  { maxOcpdAmps: 800,  cuSize: '1/0', cuCmil: 105600, alSize: '3/0', alCmil: 167800 },
  { maxOcpdAmps: 1000, cuSize: '2/0', cuCmil: 133100, alSize: '4/0', alCmil: 211600 },
  { maxOcpdAmps: 1200, cuSize: '3/0', cuCmil: 167800, alSize: '250', alCmil: 250000 },
  { maxOcpdAmps: 1600, cuSize: '4/0', cuCmil: 211600, alSize: '350', alCmil: 350000 },
  { maxOcpdAmps: 2000, cuSize: '250', cuCmil: 250000, alSize: '400', alCmil: 400000 },
  { maxOcpdAmps: 2500, cuSize: '350', cuCmil: 350000, alSize: '600', alCmil: 600000 },
  { maxOcpdAmps: 3000, cuSize: '400', cuCmil: 400000, alSize: '600', alCmil: 600000 },
  { maxOcpdAmps: 4000, cuSize: '500', cuCmil: 500000, alSize: '750', alCmil: 750000 },
  { maxOcpdAmps: 5000, cuSize: '700', cuCmil: 700000, alSize: '1200', alCmil: 1200000 },
  { maxOcpdAmps: 6000, cuSize: '800', cuCmil: 800000, alSize: '1200', alCmil: 1200000 },
];

export function egcBaseSize(ocpdAmps: number, material: 'Cu' | 'Al'): { size: string; cmil: number } {
  const row = TABLE_250_122.find(r => ocpdAmps <= r.maxOcpdAmps);
  if (!row) throw new OutOfTableRangeError('NEC Table 250.122', `OCPD ${ocpdAmps}A exceeds tabulated range (max 6000A)`);
  return material === 'Cu' ? { size: row.cuSize, cmil: row.cuCmil } : { size: row.alSize, cmil: row.alCmil };
}

/** 250.122(B): if phase conductors are upsized beyond the ampacity minimum, upsize EGC proportionally. */
export function proportionalEgcUpsize(baseCmil: number, phaseConductorRatio: number): number {
  return baseCmil * phaseConductorRatio;
}

/** Find the smallest AWG/kcmil size whose cmil area meets or exceeds a target. */
export function smallestSizeForCmil(targetCmil: number): string {
  const sorted = Object.entries(AWG_CMIL).sort((a, b) => a[1] - b[1]);
  const found = sorted.find(([, cmil]) => cmil >= targetCmil);
  if (!found) throw new OutOfTableRangeError('AWG/cmil reference', `no standard size reaches ${targetCmil} cmil`);
  return found[0];
}

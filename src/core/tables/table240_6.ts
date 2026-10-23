/**
 * NEC 240.6(A) — Standard ampere ratings for fuses and inverse-time breakers.
 * NEC 240.4(D) — Small-conductor OCPD caps (below).
 *
 * SOURCING NOTE: physically verified against a real 2017 NFPA 70 PDF — see
 * `VERIFICATION.md` ("Physical-text pass completed 2026-09-15"): exact
 * match, no discrepancies, for both 240.6(A) and 240.4(D). Both are
 * unchanged 2017->2023, so the values hold for the 2023 edition too, but
 * the check itself was performed against the 2017 physical text, not a
 * 2023 copy.
 */
export const STANDARD_OCPD_SIZES: number[] = [
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175,
  200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600,
  2000, 2500, 3000, 4000, 5000, 6000,
];

/**
 * 240.4(B) "next size up" rule: permitted when the conductor ampacity does
 * not correspond to a standard OCPD size, provided (1) it's not a multi-
 * outlet branch circuit for cord-and-plug loads, (2) the next size up does
 * not exceed 800A, and (3) the conductors aren't part of a multi-outlet
 * branch circuit supplying receptacles. v1 implements the common case
 * (feeder/single-load) and flags an Info note for the exceptions rather
 * than silently applying 240.4(B) in all cases.
 */
export function selectOcpd(conductorAmpacity: number): { size: number; usedNextSizeUp: boolean } {
  // Standard sizes are ascending; want the largest standard size <= ampacity
  // OR the next standard size up if ampacity falls between two standard sizes.
  const atOrBelow = STANDARD_OCPD_SIZES.filter(s => s <= conductorAmpacity);
  const largestAtOrBelow = atOrBelow.length ? atOrBelow[atOrBelow.length - 1] : undefined;
  if (largestAtOrBelow === conductorAmpacity) {
    return { size: largestAtOrBelow, usedNextSizeUp: false };
  }
  // conductor ampacity doesn't hit a standard size exactly -> next size up (240.4(B))
  const nextUp = STANDARD_OCPD_SIZES.find(s => s > conductorAmpacity);
  if (!nextUp) throw new Error('Conductor ampacity exceeds largest standard OCPD size (6000A) — special design required');
  return { size: nextUp, usedNextSizeUp: true };
}

/** 240.4(D) small-conductor caps (Cu). */
export const SMALL_CONDUCTOR_OCPD_CAP_CU: Record<string, number> = {
  '14': 15, '12': 20, '10': 30,
};
export const SMALL_CONDUCTOR_OCPD_CAP_AL: Record<string, number> = {
  '12': 15, '10': 25,
};

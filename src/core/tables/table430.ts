/**
 * NEC 2023 Table 430.250 — Full-Load Current, Three-Phase AC Motors.
 * Cross-verified across 4 independent sources with identical values —
 * high confidence, standard "unverified transcription" banner still applies.
 *
 * LOCKED-ROTOR CURRENT (LRA) — CORRECTED SOURCING (2024 review):
 * NEC Tables 430.248-430.251 are FULL-LOAD CURRENT tables, not locked-rotor
 * current. There is no NEC table of LRA by HP. Per the accepted correction,
 * LRA must come from one of three sources, in this priority order, and the
 * source actually used is always recorded as a logged assumption — never
 * silently defaulted:
 *   1. Manufacturer nameplate LRA (preferred; pass `nameplateLra` directly).
 *   2. NEMA locked-rotor indicating code letter (NEC Table 430.7(B) /
 *      NEMA MG 1) -> kVA-per-HP range -> back-solved LRA. The code-letter
 *      table below is standard, widely-published NEMA MG 1 data (high
 *      cross-source confidence), unlike Table 430.251 which does not exist
 *      as cited.
 *   3. NEMA design-letter rule of thumb (engineering approximation, NOT a
 *      code-tabulated value): Design B ~6-7x FLC, Design C ~4.5-5x FLC,
 *      Design D ~6-8x FLC. Always flagged as `engineering_judgment`.
 */

import { OutOfTableRangeError, UnverifiedTableValueError } from '../domain/errors';
import { Assumption } from '../domain/trace';

export type MotorVoltage = 115 | 200 | 208 | 230 | 460 | 575;

export const TABLE_430_250: Record<string, Partial<Record<MotorVoltage, number>>> = {
  '0.5': { 115: 4.4, 200: 2.5, 208: 2.4, 230: 2.2, 460: 1.1, 575: 0.9 },
  '0.75': { 115: 6.4, 200: 3.7, 208: 3.5, 230: 3.2, 460: 1.6, 575: 1.3 },
  '1': { 115: 8.4, 200: 4.8, 208: 4.6, 230: 4.2, 460: 2.1, 575: 1.7 },
  '1.5': { 115: 12, 200: 6.9, 208: 6.6, 230: 6.0, 460: 3.0, 575: 2.4 },
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
 * NEC Table 430.7(B) / NEMA MG 1 — Locked-Rotor Indicating Code Letters.
 * kVA per HP range at locked rotor, by code letter. Standard published
 * NEMA data (cross-verified, "unverified transcription" banner applies
 * the same as every other table in this file — re-key against the
 * physical codebook before final release).
 */
export const TABLE_430_7B_CODE_LETTER_KVA_PER_HP: Record<string, { min: number; max: number }> = {
  A: { min: 0, max: 3.14 },
  B: { min: 3.15, max: 3.54 },
  C: { min: 3.55, max: 3.99 },
  D: { min: 4.0, max: 4.49 },
  E: { min: 4.5, max: 4.99 },
  F: { min: 5.0, max: 5.59 },
  G: { min: 5.6, max: 6.29 },
  H: { min: 6.3, max: 7.09 },
  J: { min: 7.1, max: 7.99 },
  K: { min: 8.0, max: 8.99 },
  L: { min: 9.0, max: 9.99 },
  M: { min: 10.0, max: 11.19 },
  N: { min: 11.2, max: 12.49 },
  P: { min: 12.5, max: 13.99 },
  R: { min: 14.0, max: 15.99 },
  S: { min: 16.0, max: 17.99 },
  T: { min: 18.0, max: 19.99 },
  U: { min: 20.0, max: 22.39 },
  V: { min: 22.4, max: 999 },
};

/** Engineering rule-of-thumb LRA/FLC multiplier RANGES by NEMA design letter. Not NEC-tabulated. */
export const DESIGN_LETTER_LRA_MULTIPLIER: Record<'B' | 'C' | 'D', { min: number; max: number }> = {
  B: { min: 6, max: 7 },
  C: { min: 4.5, max: 5 },
  D: { min: 6, max: 8 },
};

export type NemaCodeLetter = keyof typeof TABLE_430_7B_CODE_LETTER_KVA_PER_HP;
export type NemaDesignLetter = keyof typeof DESIGN_LETTER_LRA_MULTIPLIER;

export interface LraResolution {
  lra: number;
  source: 'nameplate' | 'code_letter' | 'design_letter_rule_of_thumb';
  assumption: Assumption;
}

export interface LraResolutionInput {
  hp: number;
  flc: number; // NEC Table 430.250 FLC, A
  voltage: MotorVoltage;
  phase: 1 | 3;
  nameplateLra?: number;
  nemaCodeLetter?: NemaCodeLetter;
  nemaDesignLetter?: NemaDesignLetter;
  /** Overrides the design-letter midpoint multiplier if the user supplies a specific value from a datasheet. */
  designLetterMultiplierOverride?: number;
}

/**
 * Resolves locked-rotor amps with a strict priority order and ALWAYS returns
 * a logged assumption stating exactly which source and which number within
 * a range was used. Throws MissingRequiredInputError-style if none of the
 * three sources is provided — this function never invents an LRA.
 */
export function resolveMotorLra(input: LraResolutionInput): LraResolution {
  if (input.nameplateLra !== undefined) {
    return {
      lra: input.nameplateLra,
      source: 'nameplate',
      assumption: { kind: 'user_override', text: `LRA = ${input.nameplateLra}A taken directly from manufacturer nameplate data (preferred source).` },
    };
  }

  if (input.nemaCodeLetter !== undefined) {
    const row = TABLE_430_7B_CODE_LETTER_KVA_PER_HP[input.nemaCodeLetter];
    if (!row) throw new OutOfTableRangeError('NEC Table 430.7(B)', `code letter '${input.nemaCodeLetter}' not recognized`);
    // Conservative choice for a voltage-dip / protective-device screening study: use the
    // UPPER bound of the code-letter kVA/HP band (higher LRA = worse-case dip).
    const kvaPerHp = row.max;
    const lockedRotorKva = kvaPerHp * input.hp;
    const divisor = input.phase === 3 ? Math.sqrt(3) * input.voltage : input.voltage;
    const lra = (lockedRotorKva * 1000) / divisor;
    return {
      lra,
      source: 'code_letter',
      assumption: {
        kind: 'engineering_judgment',
        text: `LRA back-solved from NEMA code letter '${input.nemaCodeLetter}' (Table 430.7(B) band ${row.min}-${row.max} kVA/HP). Used the CONSERVATIVE upper bound (${kvaPerHp} kVA/HP) for a worst-case dip screening: locked-rotor kVA = ${kvaPerHp} x ${input.hp} HP = ${lockedRotorKva.toFixed(2)} kVA -> LRA = ${lra.toFixed(1)}A. Replace with nameplate LRA for a final design.`,
      },
    };
  }

  if (input.nemaDesignLetter !== undefined) {
    const band = DESIGN_LETTER_LRA_MULTIPLIER[input.nemaDesignLetter];
    const multiplier = input.designLetterMultiplierOverride ?? (band.min + band.max) / 2;
    const lra = multiplier * input.flc;
    return {
      lra,
      source: 'design_letter_rule_of_thumb',
      assumption: {
        kind: 'engineering_judgment',
        text: `No nameplate LRA or NEMA code letter provided. Estimated via engineering rule of thumb for NEMA Design ${input.nemaDesignLetter} (LRA ~= ${band.min}-${band.max}x FLC; NOT an NEC-tabulated value). Used multiplier ${multiplier}${input.designLetterMultiplierOverride === undefined ? ' (midpoint of range)' : ' (user-supplied, within/near the published range)'}: LRA = ${multiplier} x ${input.flc}A FLC = ${lra.toFixed(1)}A. This is a screening estimate — obtain nameplate or manufacturer LRA before a final protective-device or dip study.`,
      },
    };
  }

  throw new UnverifiedTableValueError(
    'Motor locked-rotor current (LRA)',
    `HP context not resolvable`,
    'No LRA source provided. Supply one of: nameplateLra (preferred), nemaCodeLetter (NEC Table 430.7(B) back-solve), or nemaDesignLetter (engineering rule-of-thumb). NEC Tables 430.248-430.251 do not contain LRA data and must never be used as one.'
  );
}

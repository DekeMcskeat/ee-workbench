/**
 * Minimal, auditable unit engine for EE Workbench.
 * Deliberately NOT a general-purpose unit library (see tech stack ADR) —
 * every conversion here is one an EE would recognize and can spot-check.
 *
 * Rule: calc modules never do raw-float math across units without going
 * through a named conversion function in this file.
 */

export interface Quantity<U extends string = string> {
  value: number;
  unit: U;
}

export function qty<U extends string>(value: number, unit: U): Quantity<U> {
  if (!Number.isFinite(value)) {
    throw new Error(`Quantity value must be finite, got ${value} ${unit}`);
  }
  return { value, unit };
}

// ---------- Length ----------
export type LengthUnit = 'ft' | 'm' | 'in' | 'mm';

const LENGTH_TO_FT: Record<LengthUnit, number> = {
  ft: 1,
  m: 3.280839895,
  in: 1 / 12,
  mm: 3.280839895 / 1000,
};

export function toFeet(q: Quantity<LengthUnit>): number {
  return q.value * LENGTH_TO_FT[q.unit];
}

export function toMeters(q: Quantity<LengthUnit>): number {
  return toFeet(q) / 3.280839895;
}

// ---------- Voltage ----------
export type VoltageUnit = 'V' | 'kV';
export function toVolts(q: Quantity<VoltageUnit>): number {
  return q.unit === 'kV' ? q.value * 1000 : q.value;
}

// ---------- Current ----------
export type CurrentUnit = 'A';
export function toAmps(q: Quantity<CurrentUnit>): number {
  return q.value;
}

// ---------- Power ----------
export type PowerUnit = 'W' | 'kW' | 'VA' | 'kVA' | 'VAR' | 'kVAR';
const POWER_SCALE: Record<PowerUnit, number> = {
  W: 1, kW: 1000, VA: 1, kVA: 1000, VAR: 1, kVAR: 1000,
};
export function toBaseWattOrVaOrVar(q: Quantity<PowerUnit>): number {
  return q.value * POWER_SCALE[q.unit];
}

// ---------- Temperature ----------
export type TempUnit = 'C' | 'F';
export function toCelsius(q: Quantity<TempUnit>): number {
  return q.unit === 'F' ? ((q.value - 32) * 5) / 9 : q.value;
}

// ---------- Area ----------
export type AreaUnit = 'in2' | 'mm2' | 'cmil';
// 1 cmil = pi/4 * (1 mil)^2 in^2 -- but NEC circular mils use the simpler
// diameter^2-in-mils definition (no pi/4 factor) by convention.
// 1 in^2 = 1,273,239.5 cmil (since cmil = (dia_mils)^2 and area = pi/4 * dia_in^2)
const CMIL_PER_IN2 = 1273239.5;
export function toIn2(q: Quantity<AreaUnit>): number {
  if (q.unit === 'in2') return q.value;
  if (q.unit === 'cmil') return q.value / CMIL_PER_IN2;
  if (q.unit === 'mm2') return q.value / 645.16;
  throw new Error(`Unhandled area unit ${q.unit}`);
}

// ---------- Significant figures (display-only rounding) ----------
/**
 * Rounds ONLY for display. Calc modules must never call this mid-calculation.
 * Enforced by convention + code review; see anti-patterns list.
 */
export function roundSigFigs(value: number, sigFigs = 4): number {
  if (value === 0) return 0;
  const magnitude = Math.ceil(Math.log10(Math.abs(value)));
  const factor = Math.pow(10, sigFigs - magnitude);
  return Math.round(value * factor) / factor;
}

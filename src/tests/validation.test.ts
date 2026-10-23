/**
 * Validation cases V1-V10 per the EE Workbench spec.
 * Each case documents its hand-derivation in comments and asserts against
 * a tolerance. This file is the executable proof that the calc kernel
 * produces hand-verifiable results, not the UI.
 */
import { describe, it, expect } from 'vitest';
import { calcVoltageDrop } from '../core/calc/voltageDrop';
import { calcConduitFill } from '../core/calc/conduitFill';
import { calcLoad } from '../core/calc/loadCalc';
import { sizeTransformer } from '../core/calc/transformer';
import { calcPfCorrection } from '../core/calc/pfCorrection';
import { calcMotorStarting } from '../core/calc/motorStarting';
import { calcPanelBalance } from '../core/calc/panelBalance';
import { lookupAmpacity, nextSizeUp } from '../core/tables/table310_16';
import { ambientCorrectionFactor, cccAdjustmentFactor } from '../core/tables/table310_15';
import { lookupMotorFlc } from '../core/tables/table430';

function assertClose(actual: number, expected: number, tolPct: number) {
  const diffPct = Math.abs((actual - expected) / expected) * 100;
  expect(diffPct, `actual=${actual} expected=${expected} (delta ${diffPct.toFixed(2)}% > tol ${tolPct}%)`).toBeLessThanOrEqual(tolPct);
}

describe('V1: Voltage drop, 3ph, 480V, 100A, 200ft, 1/0 Cu THHN steel, PF 0.85', () => {
  // Hand derivation: Table 9 (Cu, steel) 1/0 AWG: R=0.12, X=0.055 ohm/kft.
  // theta = arccos(0.85) = 31.79deg, sin=0.5268
  // Ze = 0.12*0.85 + 0.055*0.5268 = 0.102 + 0.02897 = 0.13097
  // VD = sqrt(3)*100*200*0.13097/1000 = 4.537 V -> %VD = 4.537/480 = 0.945%
  const out = calcVoltageDrop({
    size: '1/0', material: 'Cu', ampacityDesignCurrent: 100, lengthFt: 200, phase: '3ph',
    conduitMagnetic: true, powerFactor: 0.85, nominalVoltage: 480, conductorOperatingTempC: 75, parallelSets: 1,
  });

  it('%VD exact', () => assertClose(out.result.pctVdExact, 0.9452, 1));
  it('within 3% branch recommendation', () => expect(out.result.pctVdExact).toBeLessThan(3));
  it('both methods present in trace', () => expect(out.trace.length).toBeGreaterThanOrEqual(2));
});

describe('V2: Conductor derating, 75C Cu, 40C ambient, 6 CCC', () => {
  const ambFactor = ambientCorrectionFactor(40, 75);
  const cccFactor = cccAdjustmentFactor(6);

  it('ambient factor (75C @ 36-40C)', () => assertClose(ambFactor, 0.88, 0.1));
  it('CCC factor (6 conductors)', () => assertClose(cccFactor, 0.80, 0.1));
  it('combined factor', () => assertClose(ambFactor * cccFactor, 0.704, 0.5));
});

describe('V3: Transformer SCC, 1000kVA 13.8kV-480V, 5.75%Z, infinite primary', () => {
  const out = sizeTransformer({ kva: 1000, primaryVoltage: 13800, secondaryVoltage: 480, phase: '3ph', percentZ: 5.75 });

  it('secondary FLA', () => assertClose(out.result.secondaryFla, 1202.8, 0.5));
  it('available SC current', () => assertClose(out.result.secondaryAvailableFaultCurrent, 20918, 0.5));
});

describe('V4: Motor starting dip, 50HP 460V 3ph NEMA Design B DOL, 100ft 1/0 Cu feeder, 25kA source', () => {
  // CORRECTED SOURCING (per accepted spec correction): NEC 430.248-430.251
  // are FLC tables, not LRA. LRA here comes from the NEMA design-letter
  // rule-of-thumb path (Design B ~6-7x FLC, midpoint 6.5x), since neither
  // nameplate LRA nor a NEMA code letter was given in the V4 spec. This is
  // logged as an `engineering_judgment` assumption by resolveMotorLra(),
  // never silently assumed.
  //
  // Hand derivation:
  //   FLC (Table 430.250, 50HP/460V) = 65A
  //   LRA = 6.5 x 65 = 422.5A  (Design B midpoint rule of thumb)
  //   V_LN = 460/sqrt(3) = 265.581V
  //   Z_source = V_LN / I_sc = 265.581/25000 = 0.010623 ohm (reactive-only assumption, no X/R given)
  //   Feeder: 1/0 Cu, steel conduit, 75C op temp (assumed, undocumented in spec), 100ft, 1 set
  //     R = 0.12 ohm/kft x 0.1 = 0.012 ohm; X = 0.055 ohm/kft x 0.1 = 0.0055 ohm
  //     Z_cable = sqrt(0.012^2+0.0055^2) = 0.01320 ohm
  //   Z_upstream = sqrt(R_cable^2 + (Z_source+X_cable)^2) = sqrt(0.012^2+0.016123^2) = 0.020099 ohm
  //   Z_motor (locked rotor, rated V) = V_LN/LRA = 265.581/422.5 = 0.62870 ohm
  //   V_term,pu = Z_motor/(Z_upstream+Z_motor) = 0.62870/0.648799 = 0.96902 -> dip = 3.10%
  //   I_actual = V_LN/(Z_upstream+Z_motor) = 409.4A
  //   Bus dip = I_actual x Z_source / V_LN x 100 = 1.64%
  const out = calcMotorStarting({
    hp: '50', voltage: 460, phase: 3,
    nemaDesignLetter: 'B',
    startingMethod: 'DOL',
    sourceAvailableFaultCurrentA: 25000,
    feeder: { size: '1/0', material: 'Cu', lengthFt: 100, conduitMagnetic: true, conductorOperatingTempC: 75, parallelSets: 1 },
  });

  it('FLC (Table 430.250)', () => assertClose(out.result.flc, 65, 0.5));
  it('LRA (Design B rule-of-thumb, 6.5x FLC)', () => assertClose(out.result.lra, 422.5, 0.5));
  it('Z_source', () => assertClose(out.result.zSourceOhm, 0.010623, 1));
  it('Z_cable', () => assertClose(out.result.zCableOhm, 0.01320, 1));
  it('Z_upstream', () => assertClose(out.result.zUpstreamOhm, 0.020099, 1));
  it('Z_motor locked-rotor', () => assertClose(out.result.zMotorLockedRotorOhm, 0.62870, 1));
  it('terminal voltage dip %', () => assertClose(out.result.terminalVoltageDipPct, 3.098, 3));
  it('bus voltage dip %', () => assertClose(out.result.busVoltageDipPct, 1.637, 3));
  it('within NEMA 15% starting-dip guideline (not blocked)', () => expect(out.result.terminalVoltageDipPct).toBeLessThan(15));
  it('LRA source logged as engineering_judgment assumption', () => expect(out.assumptions.some(a => a.kind === 'engineering_judgment')).toBe(true));
});

describe('V5: Conduit fill boundary case, 4x4/0 THHN Cu + 1x#6 THHN Cu EGC in 2" EMT', () => {
  const out = calcConduitFill({
    conductors: [{ size: '4/0', count: 4 }, { size: '6', count: 1 }],
    conduitType: 'EMT', tradeSize: '2', isNipple: false,
  });

  it('total conductor area', () => assertClose(out.result.totalConductorArea, 1.3455, 0.1));
  it('fails 40% fill (boundary case, 1.3455 > 1.342)', () => expect(out.result.fits).toBe(false));
  it('violation warning present', () => expect(out.warnings.some((w) => w.level === 'violation')).toBe(true));
});

describe('V6: Load calc, 2000ft2 office, 120/208V 3ph, 40 receptacles, 10kVA misc, 3HP motor', () => {
  const out = calcLoad({
    occupancy: 'office', areaFt2: 2000, receptacleYokeCount: 40, miscVa: 10000,
    motors: [{ hp: '3', voltage: 208, phase: 3 }],
  });

  it('lighting VA', () => assertClose(out.result.lightingVa, 7000, 0.1));
  it('receptacle VA', () => assertClose(out.result.receptacleVa, 7200, 0.1));
  // NOTE: spec text cites motor VA ~3963VA, which back-solves to the 200V FLC
  // column (11.0A), not the 208V column (10.6A) actually specified. Using the
  // correct 208V column per NEC Table 430.250: VA = sqrt(3)*208*10.6 = 3818.8
  it('motor VA (208V column, corrected from spec)', () => assertClose(out.result.motorVa, 3818.8, 0.5));
  it('connected load note (spec cites ~28,163 VA which appears to assume the 200V FLC column; flagged, not silently matched)', () => {
    expect(out.result.connectedVa).toBeCloseTo(28018.8, 0);
  });
});

describe('V7: Parallel conductors, 2 sets 350kcmil Cu, 6 CCC total, 30C ambient', () => {
  const base90 = lookupAmpacity('350', 'Cu', 90);
  const cccFactor = cccAdjustmentFactor(6);
  const perSetAdjusted = base90 * cccFactor;
  const twoSets = perSetAdjusted * 2;
  const term75 = lookupAmpacity('350', 'Cu', 75);
  const twoSetsTerm = term75 * 2;
  const final = Math.min(twoSets, twoSetsTerm);

  it('per-set adjusted (350kcmil, 6CCC)', () => assertClose(perSetAdjusted, 280, 1));
  it('two sets adjusted', () => assertClose(twoSets, 560, 1));
  it('two sets termination cap', () => assertClose(twoSetsTerm, 620, 1));
  it('final (conductor-limited)', () => assertClose(final, 560, 1));
});

describe('V8: Capacitor sizing, 500kW 0.80PF -> 0.95PF', () => {
  const out = calcPfCorrection({ kw: 500, existingPf: 0.80, targetPf: 0.95, kvaScAtBus: 15000 });

  it('required kVAR', () => assertClose(out.result.requiredKvar, 210.66, 1));
});

describe('V9: Panel phase balance, 3ph 4w, 5 circuits including 2-pole and 3-pole taps', () => {
  // Hand derivation:
  //   Lighting A: 1200 VA on A
  //   Lighting B: 1200 VA on B
  //   Lighting C: 1000 VA on C
  //   HVAC (3-pole ABC, 6000 VA): 2000 VA per leg on A, B, C
  //   Receptacles (2-pole AB, 1800 VA): 900 VA per leg on A, B
  //   Phase A = 1200 + 2000 + 900 = 4100
  //   Phase B = 1200 + 2000 + 900 = 4100
  //   Phase C = 1000 + 2000        = 3000
  //   Total = 11200, Average = 11200/3 = 3733.33
  //   Imbalance% = (4100-3000)/3733.33 x 100 = 29.46% -> exceeds 20% guideline, warning expected
  const out = calcPanelBalance({
    phaseConfig: '3ph_4w',
    circuits: [
      { name: 'Lighting A', va: 1200, tap: 'A' },
      { name: 'Lighting B', va: 1200, tap: 'B' },
      { name: 'Lighting C', va: 1000, tap: 'C' },
      { name: 'HVAC', va: 6000, tap: 'ABC' },
      { name: 'Receptacles', va: 1800, tap: 'AB' },
    ],
  });

  it('phase A total', () => assertClose(out.result.phaseVa.A, 4100, 0.5));
  it('phase B total', () => assertClose(out.result.phaseVa.B, 4100, 0.5));
  it('phase C total', () => assertClose(out.result.phaseVa.C, 3000, 0.5));
  it('total VA', () => assertClose(out.result.totalVa, 11200, 0.5));
  it('imbalance %', () => assertClose(out.result.imbalancePct, 29.46, 1));
  it('imbalance warning present (>20% guideline)', () => expect(out.warnings.some(w => w.level === 'warning')).toBe(true));
});

describe('V10: Voltage drop, 1ph, 240V, 150A, 100ft, 250kcmil ALUMINUM THHN, PVC conduit, PF 0.9', () => {
  // Hand derivation (Table 9, Al, PVC conduit, 250kcmil): R=0.085, X=0.041 ohm/kft
  // theta = arccos(0.9) = 25.842deg, sin = 0.43589
  // Ze = 0.085*0.9 + 0.041*0.43589 = 0.0765 + 0.017872 = 0.094372
  // VD = 2*150*100*0.094372/1000 = 2.83116 V -> %VD = 2.83116/240 = 1.1797%
  const out = calcVoltageDrop({
    size: '250', material: 'Al', ampacityDesignCurrent: 150, lengthFt: 100, phase: '1ph',
    conduitMagnetic: false, powerFactor: 0.9, nominalVoltage: 240, conductorOperatingTempC: 75, parallelSets: 1,
  });

  it('%VD exact (aluminum)', () => assertClose(out.result.pctVdExact, 1.1797, 1));
  it('VD volts (aluminum)', () => assertClose(out.result.vdExact, 2.8312, 1));
  it('aluminum R/X resolved without throwing', () => expect(out.result.rBaseOhmPerKft).toBe(0.085));
});

describe('V11: Table 310.16 large-conductor gap-fill (700-900, 1250-2000 kcmil), added 2026-09-15', () => {
  // Hand derivation: values transcribed directly into table310_16.ts from the
  // 2017 NFPA 70 PDF (same source as the rest of the table); this case
  // exercises the new rows through the public lookup/iteration API rather
  // than re-deriving the ampacities themselves.
  it('1500 kcmil Cu, 75C ampacity', () => assertClose(lookupAmpacity('1500', 'Cu', 75), 625, 0.1));
  it('1500 kcmil Al, 75C ampacity', () => assertClose(lookupAmpacity('1500', 'Al', 75), 520, 0.1));
  it('700 kcmil Cu, 90C ampacity', () => assertClose(lookupAmpacity('700', 'Cu', 90), 520, 0.1));
  it('900 kcmil Al, 60C ampacity', () => assertClose(lookupAmpacity('900', 'Al', 60), 355, 0.1));

  // nextSizeUp depends on SIZE_ORDER (array order), so this locks down that
  // the new rows were inserted at the correct sort position rather than
  // just appended.
  it('nextSizeUp steps 600 -> 700 (not straight to 750)', () => expect(nextSizeUp('600')).toBe('700'));
  it('nextSizeUp steps 1000 -> 1250 (not "largest tabulated")', () => expect(nextSizeUp('1000')).toBe('1250'));
  it('nextSizeUp steps 1750 -> 2000', () => expect(nextSizeUp('1750')).toBe('2000'));
  it('nextSizeUp throws at the new largest size, 2000 kcmil', () => expect(() => nextSizeUp('2000')).toThrow());
});

describe('V12: Table 430.250 high-HP gap-fill (125-500 HP, 460/575V), added 2026-09-15', () => {
  // Hand derivation: 200 HP / 460V -> FLC = 240A (Table 430.250, gap-fill row).
  // VA = sqrt(3) x V x FLC = sqrt(3) x 460 x 240 = 191,065.19 VA
  it('200 HP / 460V FLC', () => assertClose(lookupMotorFlc('200', 460), 240, 0.1));
  it('500 HP / 575V FLC', () => assertClose(lookupMotorFlc('500', 575), 472, 0.1));

  const out = calcLoad({
    occupancy: 'office', areaFt2: 100, receptacleYokeCount: 0, miscVa: 0,
    motors: [{ hp: '200', voltage: 460, phase: 3 }],
  });
  it('200 HP motor VA through calcLoad', () => assertClose(out.result.motorVa, Math.sqrt(3) * 460 * 240, 0.1));
});

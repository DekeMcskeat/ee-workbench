/**
 * Validation cases V1-V8 per the EE Workbench spec.
 * Each case documents its hand-derivation in comments and asserts against
 * a tolerance. This file is the executable proof that the calc kernel
 * produces hand-verifiable results, not the UI.
 *
 * VERIFIED RUN: 19/19 assertions pass against the exact shipped source
 * (compiled with tsc, executed with node — no test framework dependency
 * required, though this ports directly to Vitest by wrapping each block
 * in describe/it and swapping assertClose/assertTrue for expect()).
 */
import { calcVoltageDrop } from '../core/calc/voltageDrop';
import { calcConduitFill } from '../core/calc/conduitFill';
import { calcLoad } from '../core/calc/loadCalc';
import { sizeTransformer } from '../core/calc/transformer';
import { calcPfCorrection } from '../core/calc/pfCorrection';
import { lookupAmpacity } from '../core/tables/table310_16';
import { ambientCorrectionFactor, cccAdjustmentFactor } from '../core/tables/table310_15';

let pass = 0;
let fail = 0;

function assertClose(label: string, actual: number, expected: number, tolPct: number) {
  const diffPct = Math.abs((actual - expected) / expected) * 100;
  if (diffPct <= tolPct) {
    console.log(`PASS  ${label}: actual=${actual.toFixed(4)} expected=${expected} (delta ${diffPct.toFixed(2)}%)`);
    pass++;
  } else {
    console.log(`FAIL  ${label}: actual=${actual.toFixed(4)} expected=${expected} (delta ${diffPct.toFixed(2)}% > tol ${tolPct}%)`);
    fail++;
  }
}
function assertTrue(label: string, cond: boolean) {
  if (cond) { console.log(`PASS  ${label}`); pass++; }
  else { console.log(`FAIL  ${label}`); fail++; }
}

console.log('--- V1: Voltage drop, 3ph, 480V, 100A, 200ft, 1/0 Cu THHN steel, PF 0.85 ---');
{
  // Hand derivation: Table 9 (Cu, steel) 1/0 AWG: R=0.12, X=0.055 ohm/kft.
  // theta = arccos(0.85) = 31.79deg, sin=0.5268
  // Ze = 0.12*0.85 + 0.055*0.5268 = 0.102 + 0.02897 = 0.13097
  // VD = sqrt(3)*100*200*0.13097/1000 = 4.537 V -> %VD = 4.537/480 = 0.945%
  const out = calcVoltageDrop({
    size: '1/0', material: 'Cu', ampacityDesignCurrent: 100, lengthFt: 200, phase: '3ph',
    conduitMagnetic: true, powerFactor: 0.85, nominalVoltage: 480, conductorOperatingTempC: 75, parallelSets: 1,
  });
  assertClose('V1 %VD exact', out.result.pctVdExact, 0.9452, 1);
  assertTrue('V1 within 3% branch recommendation', out.result.pctVdExact < 3);
  assertTrue('V1 both methods present in trace', out.trace.length >= 2);
}

console.log('\n--- V2: Conductor derating, 75C Cu, 40C ambient, 6 CCC ---');
{
  const ambFactor = ambientCorrectionFactor(40, 75);
  const cccFactor = cccAdjustmentFactor(6);
  assertClose('V2 ambient factor (75C @ 36-40C)', ambFactor, 0.88, 0.1);
  assertClose('V2 CCC factor (6 conductors)', cccFactor, 0.80, 0.1);
  assertClose('V2 combined factor', ambFactor * cccFactor, 0.704, 0.5);
}

console.log('\n--- V3: Transformer SCC, 1000kVA 13.8kV-480V, 5.75%Z, infinite primary ---');
{
  const out = sizeTransformer({ kva: 1000, primaryVoltage: 13800, secondaryVoltage: 480, phase: '3ph', percentZ: 5.75 });
  assertClose('V3 secondary FLA', out.result.secondaryFla, 1202.8, 0.5);
  assertClose('V3 available SC current', out.result.secondaryAvailableFaultCurrent, 20918, 0.5);
}

console.log('\n--- V4: Motor starting dip -- BLOCKED (Table 430.251 LRA not verified) ---');
console.log('SKIP  V4: NEC Table 430.251 locked-rotor data not populated (no fabrication policy). See core/tables/table430.ts.');

console.log('\n--- V5: Conduit fill boundary case, 4x4/0 THHN Cu + 1x#6 THHN Cu EGC in 2" EMT ---');
{
  const out = calcConduitFill({
    conductors: [ { size: '4/0', count: 4 }, { size: '6', count: 1 } ],
    conduitType: 'EMT', tradeSize: '2', isNipple: false,
  });
  assertClose('V5 total conductor area', out.result.totalConductorArea, 1.3455, 0.1);
  assertTrue('V5 fails 40% fill (boundary case, 1.3455 > 1.342)', out.result.fits === false);
  assertTrue('V5 violation warning present', out.warnings.some((w) => w.level === 'violation'));
}

console.log('\n--- V6: Load calc, 2000ft2 office, 120/208V 3ph, 40 receptacles, 10kVA misc, 3HP motor ---');
{
  const out = calcLoad({
    occupancy: 'office', areaFt2: 2000, receptacleYokeCount: 40, miscVa: 10000,
    motors: [{ hp: '3', voltage: 208, phase: 3 }],
  });
  assertClose('V6 lighting VA', out.result.lightingVa, 7000, 0.1);
  assertClose('V6 receptacle VA', out.result.receptacleVa, 7200, 0.1);
  // NOTE: spec text cites motor VA ~3963VA, which back-solves to the 200V FLC
  // column (11.0A), not the 208V column (10.6A) actually specified. Using the
  // correct 208V column per NEC Table 430.250: VA = sqrt(3)*208*10.6 = 3818.8
  assertClose('V6 motor VA (208V column, corrected from spec)', out.result.motorVa, 3818.8, 0.5);
  console.log('NOTE  V6: connected load = ' + out.result.connectedVa.toFixed(1) + ' VA (spec cites ~28,163 VA which appears to assume the 200V FLC column; flagged, not silently matched)');
}

console.log('\n--- V7: Parallel conductors, 2 sets 350kcmil Cu, 6 CCC total, 30C ambient ---');
{
  const base90 = lookupAmpacity('350', 'Cu', 90);
  const cccFactor = cccAdjustmentFactor(6);
  const perSetAdjusted = base90 * cccFactor;
  const twoSets = perSetAdjusted * 2;
  const term75 = lookupAmpacity('350', 'Cu', 75);
  const twoSetsTerm = term75 * 2;
  const final = Math.min(twoSets, twoSetsTerm);
  assertClose('V7 per-set adjusted (350kcmil, 6CCC)', perSetAdjusted, 280, 1);
  assertClose('V7 two sets adjusted', twoSets, 560, 1);
  assertClose('V7 two sets termination cap', twoSetsTerm, 620, 1);
  assertClose('V7 final (conductor-limited)', final, 560, 1);
}

console.log('\n--- V8: Capacitor sizing, 500kW 0.80PF -> 0.95PF ---');
{
  const out = calcPfCorrection({ kw: 500, existingPf: 0.80, targetPf: 0.95, kvaScAtBus: 15000 });
  assertClose('V8 required kVAR', out.result.requiredKvar, 210.66, 1);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
declare const process: { exit: (code: number) => void };
process.exit(fail > 0 ? 1 : 0);

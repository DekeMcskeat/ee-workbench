import { requireDefined } from '../domain/errors';
import { CalcResult, CalcWarning, TraceStep, ENGINE_VERSION, Assumption } from '../domain/trace';
import { lookupMotorFlc, resolveMotorLra, MotorVoltage, NemaCodeLetter, NemaDesignLetter } from '../tables/table430';
import { lookupTable9 } from '../tables/chapter9';
import type { ConductorMaterial } from '../tables/table310_16';

export type StartingMethod = 'DOL' | 'star_delta' | 'soft_start' | 'VFD';

export interface MotorStartingInput {
  hp: string;
  voltage: MotorVoltage; // nominal system line-to-line voltage at the motor
  phase: 1 | 3;
  nameplateLra?: number;
  nemaCodeLetter?: NemaCodeLetter;
  nemaDesignLetter?: NemaDesignLetter;
  designLetterMultiplierOverride?: number;
  startingMethod: StartingMethod;
  /** Required for soft_start / VFD only — these are device-setting dependent, never assumed. */
  currentLimitMultipleOfFlc?: number;
  sourceAvailableFaultCurrentA: number; // 3ph symmetrical, at the bus feeding this feeder
  feeder: {
    size: string;
    material: ConductorMaterial;
    lengthFt: number; // one-way
    conduitMagnetic: boolean;
    conductorOperatingTempC: number;
    parallelSets: number;
  };
}

export interface MotorStartingResult {
  flc: number;
  lra: number;
  lraSource: 'nameplate' | 'code_letter' | 'design_letter_rule_of_thumb';
  startingLineCurrentAtRatedVoltage: number; // after starting-method reduction, before sag correction
  zSourceOhm: number;
  zCableOhm: number;
  zUpstreamOhm: number;
  zMotorLockedRotorOhm: number;
  actualStartingCurrent: number; // accounts for voltage sag under total loop impedance
  terminalVoltagePu: number;
  terminalVoltageDipPct: number;
  busVoltageDipPct: number;
}

const STARTING_METHOD_REDUCTION: Record<'DOL' | 'star_delta', number> = {
  DOL: 1.0,
  // Standard motor theory: wye (star) connection during start divides line
  // voltage across windings by sqrt(3), and locked-rotor line current scales
  // with voltage, so star-delta starting current ~= LRA / 3. Not NEC-tabulated;
  // standard motor-theory result, not a fitted/estimated number.
  star_delta: 1 / 3,
};

export function calcMotorStarting(input: MotorStartingInput): CalcResult<MotorStartingResult> {
  const trace: TraceStep[] = [];
  const warnings: CalcWarning[] = [];
  const assumptions: Assumption[] = [];

  const hpNum = requireDefined(parseFloat(input.hp), 'hp');
  const isc = requireDefined(input.sourceAvailableFaultCurrentA, 'sourceAvailableFaultCurrentA');

  const flc = lookupMotorFlc(input.hp, input.voltage);
  trace.push({
    step: 'Full-load current (FLC)',
    formulaLatex: 'FLC = \\text{Table 430.250}(HP, V)',
    resultValue: flc,
    resultUnit: 'A',
    codeRefs: [{ standard: 'NEC', edition: '2023', table: '430.250' }],
  });

  const lraRes = resolveMotorLra({
    hp: hpNum, flc, voltage: input.voltage, phase: input.phase,
    nameplateLra: input.nameplateLra, nemaCodeLetter: input.nemaCodeLetter,
    nemaDesignLetter: input.nemaDesignLetter, designLetterMultiplierOverride: input.designLetterMultiplierOverride,
  });
  assumptions.push(lraRes.assumption);
  trace.push({
    step: 'Locked-rotor amps (LRA)',
    formulaLatex: 'LRA = \\text{(nameplate)} \\mid \\text{code-letter back-solve} \\mid \\text{design-letter rule of thumb}',
    resultValue: lraRes.lra,
    resultUnit: 'A',
    codeRefs: [{ standard: 'NEMA', edition: 'MG 1', table: '430.7(B) code letters', note: 'NEC 430.248-430.251 are FLC tables, not LRA — never sourced from them' }],
  });

  // Starting-method reduction of line current drawn at rated voltage
  let startingLineCurrentAtRatedVoltage: number;
  if (input.startingMethod === 'DOL' || input.startingMethod === 'star_delta') {
    const factor = STARTING_METHOD_REDUCTION[input.startingMethod];
    startingLineCurrentAtRatedVoltage = lraRes.lra * factor;
    trace.push({
      step: `Starting line current after ${input.startingMethod} reduction`,
      substitution: `${lraRes.lra.toFixed(1)} × ${factor.toFixed(3)}`,
      resultValue: startingLineCurrentAtRatedVoltage,
      resultUnit: 'A',
    });
  } else {
    const mult = requireDefined(input.currentLimitMultipleOfFlc, 'currentLimitMultipleOfFlc');
    startingLineCurrentAtRatedVoltage = mult * flc;
    assumptions.push({
      kind: 'user_override',
      text: `${input.startingMethod} starting current limit is device-setting dependent (not derivable from LRA alone). Used user-supplied ${mult}x FLC = ${startingLineCurrentAtRatedVoltage.toFixed(1)}A. Confirm against the actual soft-starter/VFD current-limit setpoint.`,
    });
    trace.push({
      step: `Starting line current, ${input.startingMethod} (user current-limit setting)`,
      substitution: `${mult} × ${flc}A FLC`,
      resultValue: startingLineCurrentAtRatedVoltage,
      resultUnit: 'A',
    });
  }

  // Source impedance — X/R not provided, so source is assumed purely reactive.
  const vLL = input.voltage;
  const vLN = input.phase === 3 ? vLL / Math.sqrt(3) : vLL;
  const zSource = vLN / isc;
  assumptions.push({
    kind: 'engineering_judgment',
    text: 'Upstream source X/R ratio not provided; source impedance treated as purely reactive (scalar magnitude combined with cable impedance by magnitude, not full phasor sum). This is a screening-level simplification — a detailed motor-starting study should use phasor (R+jX) addition with a measured or utility-supplied X/R.',
  });
  trace.push({
    step: 'Source impedance from available fault current',
    formulaLatex: 'Z_{source} = V_{LN} / I_{sc}',
    substitution: `${vLN.toFixed(2)} / ${isc}`,
    resultValue: zSource,
    resultUnit: 'ohm',
  });

  // Cable impedance (one-way, per phase)
  const { r: rCable1k, x: xCable1k } = lookupTable9(input.feeder.size, input.feeder.material, input.feeder.conduitMagnetic);
  const alpha = input.feeder.material === 'Cu' ? 0.00323 : 0.00403;
  const rCableAdj1k = rCable1k * (1 + alpha * (input.feeder.conductorOperatingTempC - 75));
  const rCable = (rCableAdj1k * (input.feeder.lengthFt / 1000)) / input.feeder.parallelSets;
  const xCable = (xCable1k * (input.feeder.lengthFt / 1000)) / input.feeder.parallelSets;
  const zCable = Math.sqrt(rCable * rCable + xCable * xCable);
  trace.push({
    step: 'Feeder cable impedance (Table 9, temperature-adjusted, one-way)',
    formulaLatex: 'Z_{cable} = \\sqrt{R^2+X^2},\\ R,X \\text{ per 1000 ft} \\times L/1000 / n_{parallel}',
    substitution: `R=${rCableAdj1k.toFixed(4)} Ω/kft × ${input.feeder.lengthFt}/1000 / ${input.feeder.parallelSets} = ${rCable.toFixed(5)}; X=${xCable1k} Ω/kft × ${input.feeder.lengthFt}/1000 / ${input.feeder.parallelSets} = ${xCable.toFixed(5)}`,
    resultValue: zCable,
    resultUnit: 'ohm',
    codeRefs: [{ standard: 'NEC', edition: '2023', table: 'Chapter 9 Table 9' }],
  });

  const rUpstream = rCable; // source R = 0 under the reactive-source assumption
  const xUpstream = zSource + xCable;
  const zUpstream = Math.sqrt(rUpstream * rUpstream + xUpstream * xUpstream);
  trace.push({
    step: 'Total upstream impedance (source + cable)',
    substitution: `sqrt(${rUpstream.toFixed(5)}^2 + (${zSource.toFixed(5)}+${xCable.toFixed(5)})^2)`,
    resultValue: zUpstream,
    resultUnit: 'ohm',
  });

  // Motor locked-rotor impedance, line-to-neutral, at rated voltage
  const zMotor = vLN / startingLineCurrentAtRatedVoltage;
  trace.push({
    step: 'Motor locked-rotor impedance at rated voltage',
    formulaLatex: 'Z_{motor} = V_{LN} / I_{start,rated V}',
    substitution: `${vLN.toFixed(2)} / ${startingLineCurrentAtRatedVoltage.toFixed(1)}`,
    resultValue: zMotor,
    resultUnit: 'ohm',
  });

  // Voltage-divider approximation: series loop of Zupstream + Zmotor, magnitudes only.
  const actualStartingCurrent = vLN / (zUpstream + zMotor);
  const terminalVoltagePu = zMotor / (zUpstream + zMotor);
  const terminalDipPct = (1 - terminalVoltagePu) * 100;
  const busVoltageDipPct = (actualStartingCurrent * zSource / vLN) * 100;

  trace.push({
    step: 'Motor terminal voltage at starting (voltage-divider approximation)',
    formulaLatex: 'V_{term,pu} = Z_{motor} / (Z_{upstream} + Z_{motor})',
    substitution: `${zMotor.toFixed(4)} / (${zUpstream.toFixed(4)} + ${zMotor.toFixed(4)})`,
    resultValue: terminalVoltagePu,
  });
  trace.push({
    step: 'Terminal voltage dip',
    formulaLatex: '\\%Dip_{term} = (1 - V_{term,pu}) \\times 100',
    resultValue: terminalDipPct,
    resultUnit: '%',
  });
  trace.push({
    step: 'Voltage dip at upstream bus (source impedance only)',
    formulaLatex: '\\%Dip_{bus} = I_{actual} \\times Z_{source} / V_{LN} \\times 100',
    substitution: `${actualStartingCurrent.toFixed(1)} × ${zSource.toFixed(5)} / ${vLN.toFixed(2)} × 100`,
    resultValue: busVoltageDipPct,
    resultUnit: '%',
  });

  if (terminalDipPct > 15) {
    warnings.push({
      level: 'warning',
      message: `Motor terminal starting dip (${terminalDipPct.toFixed(2)}%) exceeds the common NEMA MG 1 15% starting-dip guideline. This is a design recommendation, not a code violation — verify against equipment-specific tolerance.`,
    });
  }
  if (busVoltageDipPct > 10) {
    warnings.push({
      level: 'warning',
      message: `Upstream bus starting dip (${busVoltageDipPct.toFixed(2)}%) exceeds the common NEMA MG 1 10% running-bus dip guideline for equipment shared on that bus.`,
    });
  }
  warnings.push({
    level: 'info',
    message: 'This is a simplified single-impedance-divider screening calculation (magnitude addition, not full phasor analysis) intended for early design screening — not a substitute for a full motor-starting/transient stability study.',
  });

  return {
    engineVersion: ENGINE_VERSION,
    trace,
    result: {
      flc, lra: lraRes.lra, lraSource: lraRes.source,
      startingLineCurrentAtRatedVoltage,
      zSourceOhm: zSource, zCableOhm: zCable, zUpstreamOhm: zUpstream, zMotorLockedRotorOhm: zMotor,
      actualStartingCurrent, terminalVoltagePu, terminalVoltageDipPct: terminalDipPct, busVoltageDipPct,
    },
    warnings,
    assumptions,
    codeRefs: [
      { standard: 'NEC', edition: '2023', table: '430.250' },
      { standard: 'NEMA', edition: 'MG 1', section: '430.7(B)' },
      { standard: 'NEC', edition: '2023', section: '430.22 / 430.24 / 430.52' },
    ],
  };
}

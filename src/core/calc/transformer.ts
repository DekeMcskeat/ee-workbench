import { requireDefined } from '../domain/errors';
import { CalcResult, CalcWarning, TraceStep, ENGINE_VERSION, Assumption } from '../domain/trace';

export interface TransformerSizingInput {
  kva: number;
  primaryVoltage: number;
  secondaryVoltage: number;
  phase: '1ph' | '3ph';
  percentZ: number;
}

export interface TransformerSizingResult {
  primaryFla: number;
  secondaryFla: number;
  secondaryAvailableFaultCurrent: number;
}

export function sizeTransformer(input: TransformerSizingInput): CalcResult<TransformerSizingResult> {
  const trace: TraceStep[] = [];
  const warnings: CalcWarning[] = [];
  const assumptions: Assumption[] = [];

  const kva = requireDefined(input.kva, 'kva');
  const vp = requireDefined(input.primaryVoltage, 'primaryVoltage');
  const vs = requireDefined(input.secondaryVoltage, 'secondaryVoltage');
  const pctZ = requireDefined(input.percentZ, 'percentZ');

  const divisor = input.phase === '3ph' ? Math.sqrt(3) : 1;

  const primaryFla = (kva * 1000) / (divisor * vp);
  const secondaryFla = (kva * 1000) / (divisor * vs);

  trace.push({
    step: 'Primary FLA',
    formulaLatex: input.phase === '3ph' ? 'FLA = kVA \\times 1000 / (\\sqrt{3} V)' : 'FLA = kVA \\times 1000 / V',
    substitution: `${kva}×1000 / (${divisor.toFixed(3)}×${vp})`,
    resultValue: primaryFla, resultUnit: 'A',
  });
  trace.push({
    step: 'Secondary FLA',
    formulaLatex: input.phase === '3ph' ? 'FLA = kVA \\times 1000 / (\\sqrt{3} V)' : 'FLA = kVA \\times 1000 / V',
    substitution: `${kva}×1000 / (${divisor.toFixed(3)}×${vs})`,
    resultValue: secondaryFla, resultUnit: 'A',
  });

  const isc = (secondaryFla * 100) / pctZ;
  trace.push({
    step: 'Secondary available fault current (infinite primary assumption)',
    formulaLatex: 'I_{sc} = FLA_{sec} \\times 100 / \\%Z',
    substitution: `${secondaryFla.toFixed(2)} × 100 / ${pctZ}`,
    resultValue: isc, resultUnit: 'A',
    codeRefs: [{ standard: 'NEC', edition: '2023', table: '450.3(B)', note: 'Standard point-to-point method' }],
  });

  assumptions.push({
    kind: 'infinite_bus',
    text: 'Secondary available fault current assumes an infinite (zero-impedance) primary source. Actual available fault current will be lower when primary utility/source impedance is included — request utility fault duty data to refine.',
  });

  warnings.push({
    level: 'info',
    message: 'Inrush current is typically 8-12x FLA (engineering rule of thumb, not a single NEC-tabulated value). Confirm upstream OCPD coordination avoids nuisance tripping on energization.',
  });

  return {
    engineVersion: ENGINE_VERSION,
    trace,
    result: { primaryFla, secondaryFla, secondaryAvailableFaultCurrent: isc },
    warnings,
    assumptions,
    codeRefs: [{ standard: 'NEC', edition: '2023', table: '450.3(B)' }],
  };
}

// ---------- Point-to-point downstream SCC ----------
//
// FORMULA SOURCING (2026 review): the f-factor/M-multiplier shape below is
// the standard "Point-To-Point Method" as published in the Cooper Bussmann
// SPD (Selecting Protective Devices) handbook and echoed identically by
// IEEE Std 241/242 and other manufacturers' (Eaton, Square D) application
// guides:
//   f = (1.73 x L x I) / (C x N)        [three-phase faults]
//   M = 1 / (1 + f)
//   Isc_downstream = Isc_upstream x M
// An earlier version of this function also divided f by line-to-line
// voltage. That extra term is NOT part of the published method — the C-value
// tables already encode the voltage/impedance relationship the formula
// needs, so re-dividing by voltage silently made feeders look like they
// attenuate fault current far less than they actually do (non-conservative,
// i.e. downstream equipment could look adequately rated when it is not).
// Confirmed against the public-domain formula shape and corrected;
// `lineToLineVoltage` has been removed from this calc's inputs since the
// method does not use it. See VERIFICATION.md for the dated note on this
// correction.
//
// The conductor constant `C` itself remains a REQUIRED user input, not a
// table baked into this app. Unlike NEC table text, published C-value
// tables (by conductor size/material/conduit) are proprietary reference
// data (e.g. Bussmann SPD), not something this codebase can transcribe and
// verify in-house — so per the same no-fabrication policy applied
// everywhere else, the caller must supply a sourced C value, and the exact
// number used is always logged as an explicit assumption below.

export interface DownstreamSccInput {
  upstreamIsc: number;
  lengthFt: number;
  conductorConstantC: number; // required — sourced by the caller from a verified point-to-point C-value table (e.g. Bussmann SPD); not fabricated in-app.
  parallelSets: number;
  includeMotorContribution?: { totalMotorFla: number };
}

export interface DownstreamSccResult {
  f: number;
  m: number;
  downstreamIsc: number;
  downstreamIscWithMotorContribution?: number;
}

export function calcDownstreamScc(input: DownstreamSccInput): CalcResult<DownstreamSccResult> {
  const trace: TraceStep[] = [];
  const warnings: CalcWarning[] = [];
  const assumptions: Assumption[] = [];

  const f = input.lengthFt === 0
    ? 0
    : (1.732 * input.lengthFt * input.upstreamIsc) / (input.conductorConstantC * input.parallelSets);
  const m = 1 / (1 + f);
  const downstreamIsc = input.upstreamIsc * m;

  trace.push({
    step: 'f-factor',
    formulaLatex: 'f = 1.732 L I / (C n)',
    substitution: `1.732 × ${input.lengthFt} × ${input.upstreamIsc} / (${input.conductorConstantC} × ${input.parallelSets})`,
    resultValue: f,
    codeRefs: [{ standard: 'IEEE_SC_PTP', edition: 'n/a', note: 'Point-to-point method (Bussmann SPD / IEEE 241-242) — confirmed formula, no voltage term' }],
  });
  trace.push({ step: 'M multiplier', formulaLatex: 'M = 1/(1+f)', resultValue: m });
  trace.push({ step: 'Downstream Isc', formulaLatex: 'I_{sc,ds} = I_{sc,us} \\times M', resultValue: downstreamIsc, resultUnit: 'A' });

  assumptions.push({
    kind: 'other',
    text: `Conductor constant C = ${input.conductorConstantC} used per the point-to-point method (f = 1.73 x L x I / (C x N); formula confirmed against the published Bussmann SPD / IEEE 241-242 method). C itself varies by conductor size/material/conduit and was supplied directly by the caller from a verified point-to-point C-value reference table — this app does not embed that table (it is proprietary reference data, not NEC text), so re-verify the specific C value used against your reference before relying on this result for anything real.`,
  });

  let downstreamIscWithMotorContribution: number | undefined;
  if (input.includeMotorContribution) {
    downstreamIscWithMotorContribution = downstreamIsc + 4 * input.includeMotorContribution.totalMotorFla;
    assumptions.push({
      kind: 'engineering_judgment',
      text: 'Motor contribution estimated as 4× total motor FLA at this bus. This is a common engineering approximation, NOT a direct NEC 430.24 mandate — 430.24 governs conductor sizing for multiple motors, not fault contribution. Verify against IEEE/ANSI motor contribution guidance for the specific motor population.',
    });
    trace.push({
      step: 'Downstream Isc with motor contribution',
      formulaLatex: 'I_{sc,total} = I_{sc,ds} + 4 \\times \\Sigma FLA_{motors}',
      resultValue: downstreamIscWithMotorContribution,
      resultUnit: 'A',
    });
  }

  return {
    engineVersion: ENGINE_VERSION,
    trace,
    result: { f, m, downstreamIsc, downstreamIscWithMotorContribution },
    warnings,
    assumptions,
    codeRefs: [{ standard: 'IEEE_SC_PTP', edition: 'n/a', note: 'Point-to-point method' }],
  };
}

export function checkInterruptingRating(iscAtBus: number, deviceInterruptingRating: number): CalcWarning[] {
  if (iscAtBus > deviceInterruptingRating) {
    return [{
      level: 'violation',
      message: `Available fault current (${iscAtBus.toFixed(0)}A) exceeds device interrupting rating (${deviceInterruptingRating.toFixed(0)}A).`,
      codeRef: { standard: 'NEC', edition: '2023', section: '110.9' },
    }];
  }
  return [];
}

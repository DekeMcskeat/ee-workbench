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

export interface DownstreamSccInput {
  upstreamIsc: number;
  lengthFt: number;
  lineToLineVoltage: number;
  conductorConstantC: number; // [VERIFY] — see note below
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

  const f = (1.732 * input.lengthFt * input.lineToLineVoltage === 0)
    ? 0
    : (1.732 * input.lengthFt * input.upstreamIsc) / (input.conductorConstantC * input.parallelSets * input.lineToLineVoltage);
  const m = 1 / (1 + f);
  const downstreamIsc = input.upstreamIsc * m;

  trace.push({
    step: 'f-factor',
    formulaLatex: 'f = 1.732 L I_{L-L} / (C n V)',
    substitution: `1.732 × ${input.lengthFt} × ${input.upstreamIsc} / (${input.conductorConstantC} × ${input.parallelSets} × ${input.lineToLineVoltage})`,
    resultValue: f,
  });
  trace.push({ step: 'M multiplier', formulaLatex: 'M = 1/(1+f)', resultValue: m });
  trace.push({ step: 'Downstream Isc', formulaLatex: 'I_{sc,ds} = I_{sc,us} \\times M', resultValue: downstreamIsc, resultUnit: 'A' });

  assumptions.push({
    kind: 'other',
    text: `Conductor constant C = ${input.conductorConstantC} used per the point-to-point method. [VERIFY]: the full C-value reference table (by conductor size/material) was not independently verified in this build — confirm against a trusted point-to-point method reference (e.g., Bussmann SPD or equivalent) before relying on this result.`,
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

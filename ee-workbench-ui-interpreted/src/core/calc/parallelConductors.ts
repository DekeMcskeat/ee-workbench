import { requireDefined } from '../domain/errors';
import { CalcResult, CalcWarning, TraceStep, ENGINE_VERSION } from '../domain/trace';
import { lookupAmpacity, ConductorMaterial, TempRating } from '../tables/table310_16';
import { ambientCorrectionFactor, cccAdjustmentFactor } from '../tables/table310_15';

export interface ParallelConductorInput {
  size: string;
  material: ConductorMaterial;
  insulationRatedTemp: TempRating;
  terminationTempRating: TempRating;
  ambientTempC: number;
  totalCccCount: number; // total CCCs across all raceways carrying this parallel set
  parallelSets: number;
}

export interface ParallelConductorResult {
  perSetAmpacityAdjusted: number;
  totalAmpacityConductorLimited: number;
  perSetAmpacityAtTermination: number;
  totalAmpacityTerminationLimited: number;
  finalAmpacity: number;
  limitingFactor: 'conductor' | 'termination';
}

export function calcParallelConductorAmpacity(input: ParallelConductorInput): CalcResult<ParallelConductorResult> {
  const trace: TraceStep[] = [];
  const warnings: CalcWarning[] = [];

  const sets = requireDefined(input.parallelSets, 'parallelSets');
  if (sets < 2) {
    // 310.10(H) applies to parallel installs; single set is out of scope for this module.
  }
  // 310.10(H): minimum 1/0 AWG for paralleling — enforced as a violation warning, not blocked.
  const disallowedSmallSizes = ['14','12','10','8','6','4','3','2','1'];
  if (disallowedSmallSizes.includes(input.size)) {
    warnings.push({
      level: 'violation',
      message: `Conductors smaller than 1/0 AWG cannot be run in parallel per 310.10(H).`,
      codeRef: { standard: 'NEC', edition: '2023', section: '310.10(H)' },
    });
  }

  const baseAmpacity = lookupAmpacity(input.size, input.material, input.insulationRatedTemp);
  const ambientFactor = ambientCorrectionFactor(input.ambientTempC, input.insulationRatedTemp);
  const cccFactor = cccAdjustmentFactor(input.totalCccCount);
  const perSetAdjusted = baseAmpacity * ambientFactor * cccFactor;
  const totalConductorLimited = perSetAdjusted * sets;

  trace.push({
    step: 'Per-set adjusted ampacity (90°C column, derated)',
    formulaLatex: 'I_{set} = I_{base,90C} \\times CF_{amb} \\times CF_{ccc}',
    substitution: `${baseAmpacity} × ${ambientFactor} × ${cccFactor}`,
    resultValue: perSetAdjusted, resultUnit: 'A',
  });
  trace.push({
    step: `Total ampacity, ${sets} sets, conductor-limited`,
    substitution: `${perSetAdjusted} × ${sets}`,
    resultValue: totalConductorLimited, resultUnit: 'A',
  });

  const perSetTermination = lookupAmpacity(input.size, input.material, input.terminationTempRating);
  const totalTerminationLimited = perSetTermination * sets;

  trace.push({
    step: `Total ampacity, ${sets} sets, termination-limited (${input.terminationTempRating}°C)`,
    substitution: `${perSetTermination} × ${sets}`,
    resultValue: totalTerminationLimited, resultUnit: 'A',
    codeRefs: [{ standard: 'NEC', edition: '2023', section: '110.14(C)' }],
  });

  const finalAmpacity = Math.min(totalConductorLimited, totalTerminationLimited);
  const limitingFactor = totalConductorLimited <= totalTerminationLimited ? 'conductor' : 'termination';

  trace.push({
    step: 'Final ampacity (lesser of conductor-limited and termination-limited)',
    resultValue: finalAmpacity, resultUnit: 'A',
  });

  return {
    engineVersion: ENGINE_VERSION,
    trace,
    result: {
      perSetAmpacityAdjusted: perSetAdjusted,
      totalAmpacityConductorLimited: totalConductorLimited,
      perSetAmpacityAtTermination: perSetTermination,
      totalAmpacityTerminationLimited: totalTerminationLimited,
      finalAmpacity,
      limitingFactor,
    },
    warnings,
    assumptions: [],
    codeRefs: [
      { standard: 'NEC', edition: '2023', table: '310.16' },
      { standard: 'NEC', edition: '2023', section: '310.10(H)' },
    ],
  };
}

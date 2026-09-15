import { requireDefined } from '../domain/errors';
import { CalcResult, CalcWarning, TraceStep, ENGINE_VERSION } from '../domain/trace';
import { lookupAmpacity, nextSizeUp, SIZE_ORDER, ConductorMaterial, TempRating } from '../tables/table310_16';
import { ambientCorrectionFactor, cccAdjustmentFactor } from '../tables/table310_15';
import { calcVoltageDrop } from './voltageDrop';
import { egcBaseSize, proportionalEgcUpsize, smallestSizeForCmil, AWG_CMIL } from '../tables/table250_122';
import { selectOcpd, SMALL_CONDUCTOR_OCPD_CAP_CU, SMALL_CONDUCTOR_OCPD_CAP_AL } from '../tables/table240_6';

export interface ConductorSizingInput {
  continuousAmps: number;
  noncontinuousAmps: number;
  material: ConductorMaterial;
  insulationRatedTemp: TempRating; // 90 for THHN/XHHW-2
  terminationTempRating: TempRating; // per 110.14(C)
  ambientTempC: number;
  cccCount: number;
  targetPctVd: number;
  phase: '1ph' | '3ph';
  lengthFt: number;
  conduitMagnetic: boolean;
  powerFactor: number;
  nominalVoltage: number;
  conductorOperatingTempC: number;
  parallelSets: number;
  startingSize?: string; // defaults to smallest tabulated size if omitted
}

export interface ConductorSizingResult {
  designCurrent: number;
  chosenSize: string;
  finalAmpacity: number;
  pctVdExact: number;
  egcSize: string;
  ocpdSize: number;
  iterations: number;
}

export function sizeConductor(input: ConductorSizingInput): CalcResult<ConductorSizingResult> {
  const trace: TraceStep[] = [];
  const warnings: CalcWarning[] = [];
  const assumptions: CalcResult<unknown>['assumptions'] = [];

  const cont = requireDefined(input.continuousAmps, 'continuousAmps');
  const noncont = requireDefined(input.noncontinuousAmps, 'noncontinuousAmps');
  const targetVd = requireDefined(input.targetPctVd, 'targetPctVd');

  // Step 1: design current
  const designCurrent = 1.25 * cont + 1.0 * noncont;
  trace.push({
    step: 'Design current (continuous 125% + noncontinuous 100%)',
    formulaLatex: 'I_{design} = 1.25 I_{cont} + 1.00 I_{noncont}',
    substitution: `I_design = 1.25×${cont} + 1.00×${noncont}`,
    resultValue: designCurrent,
    resultUnit: 'A',
    codeRefs: [{ standard: 'NEC', edition: '2023', section: '210.19(A)(1) / 215.2(A)(1) / 230.42' }],
  });

  let currentSize = input.startingSize ?? SIZE_ORDER[0];
  let iterations = 0;
  let finalAmpacity = 0;
  let pctVdExact = 0;
  const maxIterations = SIZE_ORDER.length;

  // Steps 2-6: iterative ampacity + VD check
  // eslint-disable-next-line no-constant-condition
  while (true) {
    iterations++;
    if (iterations > maxIterations) {
      throw new Error('Conductor sizing did not converge within tabulated size range — parallel conductors likely required.');
    }

    const baseAmpacity = lookupAmpacity(currentSize, input.material, input.insulationRatedTemp);
    const ambientFactor = ambientCorrectionFactor(input.ambientTempC, input.insulationRatedTemp);
    const cccFactor = cccAdjustmentFactor(input.cccCount);
    const adjusted = baseAmpacity * ambientFactor * cccFactor;

    let terminationLimitAmpacity: number;
    try {
      terminationLimitAmpacity = lookupAmpacity(currentSize, input.material, input.terminationTempRating);
    } catch {
      terminationLimitAmpacity = adjusted; // no cap available (rare) — engineering judgement fallback would need explicit assumption in production
    }

    finalAmpacity = Math.min(adjusted, terminationLimitAmpacity);

    trace.push({
      step: `[Iteration ${iterations}] Ampacity check for ${currentSize} ${input.material}`,
      formulaLatex: 'I_{final} = \\min(I_{base,90C} \\times CF_{amb} \\times CF_{ccc},\\ I_{termination})',
      substitution: `min(${baseAmpacity}×${ambientFactor}×${cccFactor}=${adjusted.toFixed(2)}, term=${terminationLimitAmpacity})`,
      resultValue: finalAmpacity,
      resultUnit: 'A',
      codeRefs: [
        { standard: 'NEC', edition: '2023', table: '310.16' },
        { standard: 'NEC', edition: '2023', table: '310.15(B)(1)' },
        { standard: 'NEC', edition: '2023', table: '310.15(C)(1)' },
        { standard: 'NEC', edition: '2023', section: '110.14(C)' },
      ],
    });

    if (finalAmpacity * input.parallelSets < designCurrent) {
      currentSize = nextSizeUp(currentSize);
      continue;
    }

    // Ampacity satisfied — check VD
    const vdOut = calcVoltageDrop({
      size: currentSize,
      material: input.material,
      ampacityDesignCurrent: designCurrent,
      lengthFt: input.lengthFt,
      phase: input.phase,
      conduitMagnetic: input.conduitMagnetic,
      powerFactor: input.powerFactor,
      nominalVoltage: input.nominalVoltage,
      conductorOperatingTempC: input.conductorOperatingTempC,
      parallelSets: input.parallelSets,
      targetPctVd: targetVd,
    });
    pctVdExact = vdOut.result.pctVdExact;
    trace.push(...vdOut.trace);
    warnings.push(...vdOut.warnings);

    if (pctVdExact > targetVd) {
      try {
        currentSize = nextSizeUp(currentSize);
        continue;
      } catch {
        warnings.push({ level: 'warning', message: 'Cannot upsize further within tabulated range to meet target %VD — consider parallel sets or a shorter run.' });
        break;
      }
    }

    break; // both ampacity and VD satisfied
  }

  // Step 7: EGC sizing — first need OCPD (step 8), so compute OCPD first then EGC
  const smallCap = input.material === 'Cu' ? SMALL_CONDUCTOR_OCPD_CAP_CU[currentSize] : SMALL_CONDUCTOR_OCPD_CAP_AL[currentSize];
  const ocpdCandidate = selectOcpd(finalAmpacity * input.parallelSets);
  const ocpdSize = smallCap ? Math.min(ocpdCandidate.size, smallCap) : ocpdCandidate.size;

  trace.push({
    step: 'OCPD selection (standard sizes, 240.6(A))',
    formulaLatex: 'OCPD = \\text{standard size} \\le I_{final}\\ \\text{(or next size up per 240.4(B))}',
    substitution: `ampacity=${(finalAmpacity * input.parallelSets).toFixed(1)}A -> ${ocpdCandidate.size}A${smallCap ? `, capped at ${smallCap}A per 240.4(D)` : ''}`,
    resultValue: ocpdSize,
    resultUnit: 'A',
    codeRefs: [{ standard: 'NEC', edition: '2023', section: '240.6(A) / 240.4(B) / 240.4(D)' }],
  });

  const egcBase = egcBaseSize(ocpdSize, input.material);
  let egcCmil = egcBase.cmil;
  let egcSize = egcBase.size;

  // 250.122(B): if the chosen phase conductor is larger than the minimum
  // ampacity-only size would have required (i.e., upsized for VD), upsize EGC proportionally.
  const minimumSizeForAmpacityOnly = (() => {
    let s = SIZE_ORDER[0];
    for (const candidate of SIZE_ORDER) {
      const amp = lookupAmpacity(candidate, input.material, input.insulationRatedTemp) *
        ambientCorrectionFactor(input.ambientTempC, input.insulationRatedTemp) *
        cccAdjustmentFactor(input.cccCount);
      if (amp * input.parallelSets >= designCurrent) { s = candidate; break; }
    }
    return s;
  })();

  if (SIZE_ORDER.indexOf(currentSize) > SIZE_ORDER.indexOf(minimumSizeForAmpacityOnly)) {
    const phaseCmilChosen = AWG_CMIL[currentSize];
    const phaseCmilMinimum = AWG_CMIL[minimumSizeForAmpacityOnly];
    if (phaseCmilChosen && phaseCmilMinimum) {
      const ratio = phaseCmilChosen / phaseCmilMinimum;
      egcCmil = proportionalEgcUpsize(egcBase.cmil, ratio);
      egcSize = smallestSizeForCmil(egcCmil);
      warnings.push({
        level: 'info',
        message: `Phase conductor upsized from ${minimumSizeForAmpacityOnly} to ${currentSize} for voltage drop. EGC upsized proportionally from ${egcBase.size} to ${egcSize} per 250.122(B).`,
        codeRef: { standard: 'NEC', edition: '2023', section: '250.122(B)' },
      });
    }
  }

  trace.push({
    step: 'EGC sizing from OCPD rating',
    formulaLatex: 'EGC = Table\\ 250.122(OCPD),\\ \\text{upsized proportionally if phase conductors upsized (250.122(B))}',
    substitution: `OCPD=${ocpdSize}A -> base ${egcBase.size}, final ${egcSize}`,
    resultValue: egcCmil,
    resultUnit: 'cmil',
    codeRefs: [{ standard: 'NEC', edition: '2023', table: '250.122' }],
  });

  return {
    engineVersion: ENGINE_VERSION,
    trace,
    result: { designCurrent, chosenSize: currentSize, finalAmpacity, pctVdExact, egcSize, ocpdSize, iterations },
    warnings,
    assumptions,
    codeRefs: [
      { standard: 'NEC', edition: '2023', table: '310.16' },
      { standard: 'NEC', edition: '2023', table: '250.122' },
      { standard: 'NEC', edition: '2023', section: '110.14(C)' },
    ],
  };
}

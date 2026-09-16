import { requireDefined } from '../domain/errors';
import { CalcResult, CalcWarning, TraceStep, ENGINE_VERSION, Assumption } from '../domain/trace';

export interface PfCorrectionInput {
  kw: number;
  existingPf: number;
  targetPf: number;
  kvaScAtBus?: number; // for harmonic resonance check
}

export interface PfCorrectionResult {
  requiredKvar: number;
  resonantHarmonicOrder?: number;
  nearProblemHarmonic?: number;
}

export function calcPfCorrection(input: PfCorrectionInput): CalcResult<PfCorrectionResult> {
  const trace: TraceStep[] = [];
  const warnings: CalcWarning[] = [];
  const assumptions: Assumption[] = [];

  const kw = requireDefined(input.kw, 'kw');
  const pf1 = requireDefined(input.existingPf, 'existingPf');
  const pf2 = requireDefined(input.targetPf, 'targetPf');

  const theta1 = Math.acos(pf1);
  const theta2 = Math.acos(pf2);
  const kvar = kw * (Math.tan(theta1) - Math.tan(theta2));

  trace.push({
    step: 'Required capacitor kVAR',
    formulaLatex: 'kVAR = kW (\\tan\\theta_1 - \\tan\\theta_2)',
    substitution: `${kw} × (tan(${(theta1 * 180 / Math.PI).toFixed(2)}°) - tan(${(theta2 * 180 / Math.PI).toFixed(2)}°)) = ${kw} × (${Math.tan(theta1).toFixed(4)} - ${Math.tan(theta2).toFixed(4)})`,
    resultValue: kvar,
    resultUnit: 'kVAR',
    codeRefs: [{ standard: 'NEC', edition: '2023', section: 'Article 460', note: 'Governs capacitor equipment generally — the kVAR sizing formula itself is standard power-engineering trigonometry, not an NEC-tabulated value.' }],
  });

  let resonantHarmonicOrder: number | undefined;
  let nearProblemHarmonic: number | undefined;

  if (input.kvaScAtBus !== undefined) {
    resonantHarmonicOrder = Math.sqrt(input.kvaScAtBus / kvar);
    trace.push({
      step: 'Harmonic resonance order',
      formulaLatex: 'h = \\sqrt{kVA_{sc} / kVAR_{cap}}',
      substitution: `√(${input.kvaScAtBus} / ${kvar.toFixed(2)})`,
      resultValue: resonantHarmonicOrder,
    });

    for (const problemOrder of [5, 7, 11]) {
      if (Math.abs(resonantHarmonicOrder - problemOrder) <= 0.5) {
        nearProblemHarmonic = problemOrder;
        warnings.push({
          level: 'warning',
          message: `Computed resonant harmonic order (h=${resonantHarmonicOrder.toFixed(2)}) is within 0.5 of the ${problemOrder}th harmonic — a common order in 6-pulse VFD/nonlinear-load systems. Consider a detuned reactor or resizing the bank.`,
        });
      }
    }
  }

  assumptions.push({
    kind: 'engineering_judgment',
    text: 'Capacitor voltage rise and NEC Article 460 disconnect/OCPD sizing are not computed in this v1 module pass — apply 460.8(C) (disconnect >=135% of rated capacitor current) manually until built.',
  });

  return {
    engineVersion: ENGINE_VERSION,
    trace,
    result: { requiredKvar: kvar, resonantHarmonicOrder, nearProblemHarmonic },
    warnings,
    assumptions,
    codeRefs: [{ standard: 'NEC', edition: '2023', section: 'Article 460' }],
  };
}

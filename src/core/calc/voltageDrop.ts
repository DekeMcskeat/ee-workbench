import { requireDefined } from '../domain/errors';
import { CalcResult, CalcWarning, TraceStep, ENGINE_VERSION } from '../domain/trace';
import { lookupTable9 } from '../tables/chapter9';
import type { ConductorMaterial } from '../tables/table310_16';

export interface VoltageDropInput {
  size: string;
  material: ConductorMaterial;
  ampacityDesignCurrent: number; // A — the design current, not ampacity
  lengthFt: number; // one-way
  phase: '1ph' | '3ph';
  conduitMagnetic: boolean;
  powerFactor: number; // 0-1
  nominalVoltage: number; // V, line-to-line for 3ph
  conductorOperatingTempC: number; // for R temp adjustment
  parallelSets: number;
  targetPctVd?: number; // optional — only used for flagging, not required
}

export interface VoltageDropResult {
  rBaseOhmPerKft: number;
  rAdjustedOhmPerKft: number;
  xOhmPerKft: number;
  vdExact: number;
  pctVdExact: number;
  vdApprox: number;
  pctVdApprox: number;
  divergencePct: number;
}

const ALPHA: Record<ConductorMaterial, number> = { Cu: 0.00323, Al: 0.00403 };
const K_FACTOR: Record<ConductorMaterial, number> = { Cu: 12.9, Al: 21.2 };

// Circular mil reference duplicated here intentionally minimal; full table lives in table250_122.ts
import { AWG_CMIL } from '../tables/table250_122';

export function calcVoltageDrop(input: VoltageDropInput): CalcResult<VoltageDropResult> {
  const trace: TraceStep[] = [];
  const warnings: CalcWarning[] = [];

  const I = requireDefined(input.ampacityDesignCurrent, 'ampacityDesignCurrent');
  const L = requireDefined(input.lengthFt, 'lengthFt');
  const PF = requireDefined(input.powerFactor, 'powerFactor');
  const V = requireDefined(input.nominalVoltage, 'nominalVoltage');
  const sets = requireDefined(input.parallelSets, 'parallelSets');

  const { r: rBase, x: xBase } = lookupTable9(input.size, input.material, input.conduitMagnetic);
  const alpha = ALPHA[input.material];
  const rAdj = rBase * (1 + alpha * (input.conductorOperatingTempC - 75));

  trace.push({
    step: 'Temperature-adjust R from Table 9 75°C baseline',
    formulaLatex: 'R_2 = R_1 [1 + \\alpha(T_2 - 75)]',
    substitution: `R_2 = ${rBase} × [1 + ${alpha} × (${input.conductorOperatingTempC} - 75)]`,
    resultValue: rAdj,
    resultUnit: 'ohm/kft',
    codeRefs: [{ standard: 'NEC', edition: '2023', table: 'Chapter 9 Table 9' }],
  });

  const rEff = rAdj / sets;
  const xEff = xBase / sets;
  const theta = Math.acos(PF);
  const multiplier = input.phase === '3ph' ? Math.sqrt(3) : 2;

  const vdExact = (multiplier * I * L * (rEff * PF + xEff * Math.sin(theta))) / 1000;
  const pctVdExact = (vdExact / V) * 100;

  trace.push({
    step: 'Exact method voltage drop',
    formulaLatex: 'VD = k \\cdot I \\cdot L \\cdot (R\\cos\\theta + X\\sin\\theta) / 1000',
    substitution: `VD = ${multiplier.toFixed(3)} × ${I} × ${L} × (${rEff.toFixed(4)}×${PF} + ${xEff.toFixed(4)}×${Math.sin(theta).toFixed(4)}) / 1000`,
    resultValue: vdExact,
    resultUnit: 'V',
    codeRefs: [{ standard: 'NEC', edition: '2023', section: '210.19(A) Informational Note 4 / 215.2(A) Informational Note 2' }],
  });

  const cmil = AWG_CMIL[input.size];
  let vdApprox = NaN;
  let pctVdApprox = NaN;
  let divergencePct = NaN;

  if (cmil !== undefined) {
    const K = K_FACTOR[input.material];
    const approxMultiplier = input.phase === '3ph' ? Math.sqrt(3) : 2;
    vdApprox = (approxMultiplier * K * I * L) / (cmil * sets);
    pctVdApprox = (vdApprox / V) * 100;
    divergencePct = Math.abs(pctVdExact - pctVdApprox);

    trace.push({
      step: 'Approximate (K-factor) method voltage drop',
      formulaLatex: 'VD = k \\cdot K \\cdot I \\cdot L / CM',
      substitution: `VD = ${approxMultiplier.toFixed(3)} × ${K} × ${I} × ${L} / (${cmil} × ${sets})`,
      resultValue: vdApprox,
      resultUnit: 'V',
    });

    if (divergencePct > 0.5) {
      warnings.push({
        level: 'info',
        message: `Exact and approximate VD methods diverge by ${divergencePct.toFixed(2)}% (>0.5% threshold). Exact method includes conductor reactance which is conduit-material-dependent; approximate method assumes DC-like resistance only. Divergence grows with conductor size and magnetic (steel) conduit.`,
      });
    }
  } else {
    warnings.push({
      level: 'info',
      message: `Approximate method skipped — no circular-mil reference for size '${input.size}'.`,
    });
  }

  if (input.targetPctVd !== undefined && pctVdExact > input.targetPctVd) {
    warnings.push({
      level: 'warning',
      message: `%VD (exact, ${pctVdExact.toFixed(2)}%) exceeds target of ${input.targetPctVd}%. This is a recommendation (NEC Informational Note), not a code violation — verify against project-specific requirements.`,
      codeRef: { standard: 'NEC', edition: '2023', section: '210.19(A) IN 4 / 215.2(A) IN 2' },
    });
  }

  return {
    engineVersion: ENGINE_VERSION,
    trace,
    result: { rBaseOhmPerKft: rBase, rAdjustedOhmPerKft: rAdj, xOhmPerKft: xBase, vdExact, pctVdExact, vdApprox, pctVdApprox, divergencePct },
    warnings,
    assumptions: [],
    codeRefs: [{ standard: 'NEC', edition: '2023', table: 'Chapter 9 Table 9' }],
  };
}

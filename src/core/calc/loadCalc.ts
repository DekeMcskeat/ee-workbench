import { requireDefined } from '../domain/errors';
import { CalcResult, CalcWarning, TraceStep, ENGINE_VERSION } from '../domain/trace';
import { lookupMotorFlc, MotorVoltage } from '../tables/table430';

/**
 * NEC Table 220.12 — General Lighting Loads by Occupancy (VA/ft²).
 * SOURCING NOTE: office = 3.5 VA/ft² is the widely-cited value and is used
 * here, but per the "no fabrication" policy this full occupancy table
 * should be re-verified row-by-row against the codebook before other
 * occupancy types are exposed in the UI. Only 'office' and 'warehouse'
 * (commonly cited at 0.25 VA/ft²) are populated; all others throw.
 */
export const TABLE_220_12: Record<string, number> = {
  office: 3.5,
  warehouse_storage: 0.25,
};

export interface LoadCalcInput {
  occupancy: keyof typeof TABLE_220_12;
  areaFt2: number;
  receptacleYokeCount: number;
  miscVa: number;
  motors: { hp: string; voltage: MotorVoltage; phase: 1 | 3 }[];
}

export interface LoadCalcResult {
  lightingVa: number;
  receptacleVa: number;
  miscVa: number;
  motorVa: number;
  connectedVa: number;
}

export function calcLoad(input: LoadCalcInput): CalcResult<LoadCalcResult> {
  const trace: TraceStep[] = [];
  const warnings: CalcWarning[] = [];

  const areaFt2 = requireDefined(input.areaFt2, 'areaFt2');
  const vaPerFt2 = TABLE_220_12[input.occupancy];
  if (vaPerFt2 === undefined) {
    throw new Error(`[VERIFY] Table 220.12 VA/ft² for occupancy '${input.occupancy}' is not in the verified subset (office, warehouse_storage only). Add and verify against the codebook before use.`);
  }

  const lightingVa = areaFt2 * vaPerFt2;
  trace.push({
    step: 'General lighting load',
    formulaLatex: 'VA_{lighting} = A_{ft^2} \\times VA/ft^2',
    substitution: `${areaFt2} × ${vaPerFt2}`,
    resultValue: lightingVa,
    resultUnit: 'VA',
    codeRefs: [{ standard: 'NEC', edition: '2023', table: '220.12' }],
  });

  const receptacleVa = requireDefined(input.receptacleYokeCount, 'receptacleYokeCount') * 180;
  trace.push({
    step: 'Receptacle load',
    formulaLatex: 'VA_{recept} = N_{yokes} \\times 180',
    substitution: `${input.receptacleYokeCount} × 180`,
    resultValue: receptacleVa,
    resultUnit: 'VA',
    codeRefs: [{ standard: 'NEC', edition: '2023', section: '220.14(I)' }],
  });

  const miscVa = requireDefined(input.miscVa, 'miscVa');
  trace.push({ step: 'Miscellaneous equipment load (user-entered)', resultValue: miscVa, resultUnit: 'VA' });

  let motorVa = 0;
  for (const m of input.motors) {
    const flc = lookupMotorFlc(m.hp, m.voltage);
    const va = m.phase === 3 ? Math.sqrt(3) * m.voltage * flc : m.voltage * flc;
    motorVa += va;
    trace.push({
      step: `Motor load: ${m.hp} HP, ${m.voltage}V, ${m.phase}ph`,
      formulaLatex: m.phase === 3 ? 'VA = \\sqrt{3} \\cdot V \\cdot FLC' : 'VA = V \\cdot FLC',
      substitution: m.phase === 3 ? `√3 × ${m.voltage} × ${flc}` : `${m.voltage} × ${flc}`,
      resultValue: va,
      resultUnit: 'VA',
      codeRefs: [{ standard: 'NEC', edition: '2023', table: '430.250', note: `FLC=${flc}A from table, not nameplate, per 430.6(A)(1)` }],
    });
  }

  const connectedVa = lightingVa + receptacleVa + miscVa + motorVa;

  return {
    engineVersion: ENGINE_VERSION,
    trace,
    result: { lightingVa, receptacleVa, miscVa, motorVa, connectedVa },
    warnings,
    assumptions: [],
    codeRefs: [
      { standard: 'NEC', edition: '2023', table: '220.12' },
      { standard: 'NEC', edition: '2023', section: '220.14(I)' },
      { standard: 'NEC', edition: '2023', table: '430.250' },
    ],
  };
}

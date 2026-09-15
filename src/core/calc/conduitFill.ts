import { CalcResult, CalcWarning, TraceStep, ENGINE_VERSION } from '../domain/trace';
import { fillPercentLimit, conduitInteriorArea, conductorAreaThhn, ConduitAreaRow } from '../tables/chapter9';

export interface ConduitFillInput {
  conductors: { size: string; count: number }[]; // THHN/THWN-2 assumed; extend for other insulations
  conduitType: ConduitAreaRow['type'];
  tradeSize: string;
  isNipple: boolean;
}

export interface ConduitFillResult {
  totalConductorArea: number;
  conduitInteriorArea100pct: number;
  fillLimitPct: number;
  allowedArea: number;
  fillPct: number;
  fits: boolean;
}

export function calcConduitFill(input: ConduitFillInput): CalcResult<ConduitFillResult> {
  const trace: TraceStep[] = [];
  const warnings: CalcWarning[] = [];

  let totalArea = 0;
  const totalCount = input.conductors.reduce((s, c) => s + c.count, 0);

  for (const c of input.conductors) {
    const area = conductorAreaThhn(c.size);
    const subtotal = area * c.count;
    totalArea += subtotal;
    trace.push({
      step: `Conductor area: ${c.count} × ${c.size} THHN`,
      substitution: `${c.count} × ${area} in²`,
      resultValue: subtotal,
      resultUnit: 'in²',
      codeRefs: [{ standard: 'NEC', edition: '2023', table: 'Chapter 9 Table 5' }],
    });
  }

  const interior100 = conduitInteriorArea(input.conduitType, input.tradeSize);
  const limitPct = fillPercentLimit(totalCount, input.isNipple);
  const allowedArea = interior100 * limitPct;
  const fillPct = (totalArea / interior100) * 100;
  const fits = totalArea <= allowedArea;

  trace.push({
    step: 'Total conductor area vs. allowed fill',
    formulaLatex: '\\text{Fill \\%} = \\sum A_{conductor} / A_{conduit} \\times 100',
    substitution: `${totalArea.toFixed(4)} in² vs allowed ${allowedArea.toFixed(4)} in² (${(limitPct * 100).toFixed(0)}% of ${interior100} in²)`,
    resultValue: fillPct,
    resultUnit: '%',
    codeRefs: [
      { standard: 'NEC', edition: '2023', table: 'Chapter 9 Table 1' },
      { standard: 'NEC', edition: '2023', table: 'Chapter 9 Table 4' },
    ],
  });

  if (!fits) {
    const marginPct = ((totalArea - allowedArea) / allowedArea) * 100;
    warnings.push({
      level: 'violation',
      message: `Conduit fill exceeds ${(limitPct * 100).toFixed(0)}% limit by ${marginPct.toFixed(1)}%. ${
        marginPct < 2 ? 'This is a boundary case — recompute with exact manufacturer conductor OD if this is a close call.' : ''
      } Upsize conduit or reduce conductor count.`,
      codeRef: { standard: 'NEC', edition: '2023', table: 'Chapter 9 Table 1' },
    });
  } else if ((allowedArea - totalArea) / allowedArea < 0.02) {
    warnings.push({
      level: 'info',
      message: `Fill is within 2% of the limit (boundary case) — consider the next trade size up for pull-tension margin.`,
    });
  }

  return {
    engineVersion: ENGINE_VERSION,
    trace,
    result: { totalConductorArea: totalArea, conduitInteriorArea100pct: interior100, fillLimitPct: limitPct, allowedArea, fillPct, fits },
    warnings,
    assumptions: [],
    codeRefs: [{ standard: 'NEC', edition: '2023', table: 'Chapter 9 Table 1, 4, 5' }],
  };
}

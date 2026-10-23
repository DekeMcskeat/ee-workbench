/**
 * Field-vs-design variance — compares a field-recorded measurement
 * (`FieldCheck`) against the office design `CalcResult`, for the two
 * calcs where a field engineer can practically re-measure the design
 * quantity with handheld instruments: feeder %VD (voltmeter) and panel
 * phase balance (clamp meter per leg).
 *
 * Same no-fabrication rule as the rest of the kernel: a missing design
 * result or a missing/incomplete field measurement throws rather than
 * rendering a silent "0% variance" or "OK". `NoFieldMeasurementError`
 * specifically means "nothing recorded yet" so the UI can show a neutral
 * "not yet verified" state instead of a scary error.
 */
import { MissingRequiredInputError, NoFieldMeasurementError } from '../domain/errors';
import { CalcResult, CalcWarning, TraceStep, ENGINE_VERSION, WarningLevel } from '../domain/trace';
import type { FieldCheck } from '../domain/fieldCheck';
import type { PanelBalanceResult } from './panelBalance';

/** >10% variance from design is a warning; >20% is a violation. Named constants, not magic numbers, so the thresholds are visible and testable. */
export const FIELD_VARIANCE_WARNING_PCT = 10;
export const FIELD_VARIANCE_VIOLATION_PCT = 20;

export interface VarianceResult {
  designValue: number;
  measuredValue: number;
  /** measuredValue - designValue, in the metric's native unit. */
  absoluteVariance: number;
  /** absoluteVariance as a percentage of designValue. Infinite when designValue is exactly 0 and measuredValue isn't (an undefined relative variance, not a bug — flagged as a violation). */
  percentVariance: number;
}

function buildVarianceResult(metricLabel: string, unit: string, designValue: number, measuredValue: number): CalcResult<VarianceResult> {
  const absoluteVariance = measuredValue - designValue;
  const percentVariance = designValue !== 0
    ? (absoluteVariance / designValue) * 100
    : (measuredValue === 0 ? 0 : (measuredValue > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY));
  const absPct = Math.abs(percentVariance);

  const trace: TraceStep[] = [
    { step: `Design ${metricLabel} (office calculation)`, resultValue: Number(designValue.toFixed(4)), resultUnit: unit },
    { step: `Field-measured ${metricLabel}`, resultValue: Number(measuredValue.toFixed(4)), resultUnit: unit },
    {
      step: 'Variance',
      formulaLatex: '\\%\\Delta = (Measured - Design) / Design \\times 100',
      substitution: `(${measuredValue} - ${designValue}) / ${designValue} × 100`,
      resultValue: Number.isFinite(percentVariance) ? Number(percentVariance.toFixed(2)) : 'undefined (design value is 0)',
      resultUnit: Number.isFinite(percentVariance) ? '%' : undefined,
    },
  ];

  const warnings: CalcWarning[] = [];
  const pctText = Number.isFinite(absPct) ? `${absPct.toFixed(1)}%` : 'an undefined percentage (design value is 0)';
  if (absPct > FIELD_VARIANCE_VIOLATION_PCT) {
    warnings.push({
      level: 'violation',
      message: `Field-measured ${metricLabel} (${measuredValue.toFixed(2)}${unit}) diverges from the design calculation (${designValue.toFixed(2)}${unit}) by ${pctText} — exceeds the ${FIELD_VARIANCE_VIOLATION_PCT}% violation threshold. Investigate before sign-off.`,
    });
  } else if (absPct > FIELD_VARIANCE_WARNING_PCT) {
    warnings.push({
      level: 'warning',
      message: `Field-measured ${metricLabel} (${measuredValue.toFixed(2)}${unit}) diverges from the design calculation (${designValue.toFixed(2)}${unit}) by ${pctText} — exceeds the ${FIELD_VARIANCE_WARNING_PCT}% guideline.`,
    });
  }

  return {
    engineVersion: ENGINE_VERSION,
    trace,
    result: { designValue, measuredValue, absoluteVariance, percentVariance },
    warnings,
    assumptions: [],
    codeRefs: [],
  };
}

/**
 * Feeder %VD field check. Design comes from either sizeConductor's or
 * calcVoltageDrop's result — both share the `pctVdExact` field, so this
 * takes the minimal structural shape rather than importing either result
 * type, and works against whichever tool last computed it.
 */
export function calcFeederVoltageDropVariance(
  design: CalcResult<{ pctVdExact: number }> | null | undefined,
  fieldCheck: FieldCheck | null | undefined,
): CalcResult<VarianceResult> {
  if (!design?.result || !Number.isFinite(design.result.pctVdExact)) {
    throw new MissingRequiredInputError('design %VD result (run the Conductor sizing calc on this feeder first)');
  }
  const designValue = design.result.pctVdExact;

  const measuredValue = fieldCheck?.measured?.pctVd;
  if (measuredValue === undefined || !Number.isFinite(measuredValue)) {
    throw new NoFieldMeasurementError('No field-measured %VD has been recorded for this feeder yet — enter a measurement before a variance can be shown.');
  }

  return buildVarianceResult('%VD', '%', designValue, measuredValue);
}

/**
 * Panel phase-balance field check. The field engineer clamp-meters each
 * active leg; this re-derives an imbalance% from the measured currents
 * with the exact same formula calcPanelBalance uses for VA (dimensionally
 * consistent, since VA and current are proportional per leg at a fixed
 * voltage), then compares that against the design imbalance%.
 *
 * `phaseConfig` must be passed explicitly (not inferred from the design
 * result, which doesn't carry it) so a 1ph_3w panel's C leg is correctly
 * never required, and a 3ph_4w panel's C leg is always required — even
 * when the design shows 0 VA on it, rather than silently treating "not
 * measured" as "measured zero".
 */
export function calcPanelBalanceVariance(
  design: CalcResult<PanelBalanceResult> | null | undefined,
  phaseConfig: '1ph_3w' | '3ph_4w',
  fieldCheck: FieldCheck | null | undefined,
): CalcResult<VarianceResult> {
  if (!design?.result || !Number.isFinite(design.result.imbalancePct)) {
    throw new MissingRequiredInputError('design phase-balance result (run the Phase balance calc on this panel first)');
  }
  const designValue = design.result.imbalancePct;

  const activePhases: ('A' | 'B' | 'C')[] = phaseConfig === '1ph_3w' ? ['A', 'B'] : ['A', 'B', 'C'];
  const m = fieldCheck?.measured;
  const currents: Partial<Record<'A' | 'B' | 'C', number>> = { A: m?.currentA, B: m?.currentB, C: m?.currentC };
  for (const p of activePhases) {
    const v = currents[p];
    if (v === undefined || !Number.isFinite(v)) {
      throw new NoFieldMeasurementError(`Field-measured phase ${p} current has not been recorded for this panel yet — clamp-meter all active legs (${activePhases.join('/')}) before a variance can be shown.`);
    }
  }

  const total = activePhases.reduce((s, p) => s + currents[p]!, 0);
  const avg = total / activePhases.length;
  let maxP = activePhases[0];
  let minP = activePhases[0];
  for (const p of activePhases) {
    if (currents[p]! > currents[maxP]!) maxP = p;
    if (currents[p]! < currents[minP]!) minP = p;
  }
  const measuredValue = avg > 0 ? ((currents[maxP]! - currents[minP]!) / avg) * 100 : 0;

  return buildVarianceResult('phase imbalance', '%', designValue, measuredValue);
}

export interface FieldCheckHistoryRow {
  timestamp: string;
  note?: string;
  designValue: number;
  measuredValue: number;
  absoluteVariance: number;
  percentVariance: number;
  warningLevel: WarningLevel | null;
}

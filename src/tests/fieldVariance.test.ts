/**
 * Field-vs-design variance tests, in the same hand-derived style as
 * validation.test.ts and panelBalance.test.ts. Covers both variance
 * functions plus the edge cases the field-verification feature is built
 * around: no measurement yet, measurement exactly at a warning/violation
 * threshold, and a missing design result — each proven not to silently
 * report "0% variance" or "OK" (see also anti-fabrication.test.ts).
 */
import { describe, it, expect } from 'vitest';
import {
  calcFeederVoltageDropVariance, calcPanelBalanceVariance,
  FIELD_VARIANCE_WARNING_PCT, FIELD_VARIANCE_VIOLATION_PCT,
} from '../core/calc/fieldVariance';
import { calcPanelBalance } from '../core/calc/panelBalance';
import { calcVoltageDrop } from '../core/calc/voltageDrop';
import { MissingRequiredInputError, NoFieldMeasurementError } from '../core/domain/errors';
import { ENGINE_VERSION, type CalcResult } from '../core/domain/trace';
import type { FieldCheck } from '../core/domain/fieldCheck';

function fieldCheck(measured: Record<string, number>): FieldCheck {
  return { id: 'fc1', projectId: 'p1', nodeId: 'n1', subToolId: 'conductor', timestamp: '2026-09-15T12:00:00.000Z', measured };
}

// A minimal, deliberately synthetic CalcResult wrapper — the variance
// functions only read .result off of it, matching how the real
// sizeConductor()/calcPanelBalance() outputs are shaped.
function wrap<T>(result: T): CalcResult<T> {
  return { engineVersion: ENGINE_VERSION, trace: [], result, warnings: [], assumptions: [], codeRefs: [] };
}

describe('calcFeederVoltageDropVariance', () => {
  describe('no measurement recorded yet', () => {
    it('throws NoFieldMeasurementError rather than reporting 0% variance', () => {
      const design = wrap({ pctVdExact: 2.4 });
      expect(() => calcFeederVoltageDropVariance(design, undefined)).toThrow(NoFieldMeasurementError);
      expect(() => calcFeederVoltageDropVariance(design, null)).toThrow(NoFieldMeasurementError);
      expect(() => calcFeederVoltageDropVariance(design, fieldCheck({}))).toThrow(NoFieldMeasurementError);
    });
  });

  describe('missing design result', () => {
    it('throws MissingRequiredInputError rather than treating a measurement as "OK" with nothing to compare against', () => {
      expect(() => calcFeederVoltageDropVariance(undefined, fieldCheck({ pctVd: 2.4 }))).toThrow(MissingRequiredInputError);
      expect(() => calcFeederVoltageDropVariance(null, fieldCheck({ pctVd: 2.4 }))).toThrow(MissingRequiredInputError);
      expect(() => calcFeederVoltageDropVariance(wrap({ pctVdExact: NaN }), fieldCheck({ pctVd: 2.4 }))).toThrow(MissingRequiredInputError);
    });
  });

  describe('hand-derived variance, real feeder %VD (V1 validation figures)', () => {
    // Design %VD reused from validation.test.ts's V1 case: 0.9452%.
    const design = calcVoltageDrop({
      size: '1/0', material: 'Cu', ampacityDesignCurrent: 100, lengthFt: 200, phase: '3ph',
      conduitMagnetic: true, powerFactor: 0.85, nominalVoltage: 480, conductorOperatingTempC: 75, parallelSets: 1,
    });

    it('a matching field measurement reports exactly 0% variance and no warning', () => {
      const out = calcFeederVoltageDropVariance(design, fieldCheck({ pctVd: design.result.pctVdExact }));
      expect(out.result.percentVariance).toBe(0);
      expect(out.warnings.length).toBe(0);
    });

    it('measurement 5% above design (within the 10% warning threshold) reports no warning', () => {
      const measured = design.result.pctVdExact * 1.05;
      const out = calcFeederVoltageDropVariance(design, fieldCheck({ pctVd: measured }));
      expect(out.result.percentVariance).toBeCloseTo(5, 1);
      expect(out.warnings.length).toBe(0);
    });

    it('measurement 15% above design crosses into a warning, not a violation', () => {
      const measured = design.result.pctVdExact * 1.15;
      const out = calcFeederVoltageDropVariance(design, fieldCheck({ pctVd: measured }));
      expect(out.warnings.length).toBe(1);
      expect(out.warnings[0].level).toBe('warning');
    });

    it('measurement 25% above design crosses into a violation', () => {
      const measured = design.result.pctVdExact * 1.25;
      const out = calcFeederVoltageDropVariance(design, fieldCheck({ pctVd: measured }));
      expect(out.warnings.length).toBe(1);
      expect(out.warnings[0].level).toBe('violation');
    });

    it('a lower field measurement produces a negative absolute variance', () => {
      const measured = design.result.pctVdExact * 0.9;
      const out = calcFeederVoltageDropVariance(design, fieldCheck({ pctVd: measured }));
      expect(out.result.absoluteVariance).toBeLessThan(0);
      expect(out.result.percentVariance).toBeCloseTo(-10, 1);
    });
  });

  describe('threshold boundaries (exclusive, matching calcPanelBalance\'s >20% convention)', () => {
    const design = wrap({ pctVdExact: 10 });

    it(`does not warn at exactly the ${FIELD_VARIANCE_WARNING_PCT}% boundary`, () => {
      const out = calcFeederVoltageDropVariance(design, fieldCheck({ pctVd: 11 })); // (11-10)/10*100 = 10.0%
      expect(out.result.percentVariance).toBeCloseTo(FIELD_VARIANCE_WARNING_PCT, 6);
      expect(out.warnings.length).toBe(0);
    });

    it(`warns just past the ${FIELD_VARIANCE_WARNING_PCT}% boundary`, () => {
      const out = calcFeederVoltageDropVariance(design, fieldCheck({ pctVd: 11.01 }));
      expect(out.warnings[0].level).toBe('warning');
    });

    it(`does not escalate to violation at exactly the ${FIELD_VARIANCE_VIOLATION_PCT}% boundary`, () => {
      const out = calcFeederVoltageDropVariance(design, fieldCheck({ pctVd: 12 })); // (12-10)/10*100 = 20.0%
      expect(out.result.percentVariance).toBeCloseTo(FIELD_VARIANCE_VIOLATION_PCT, 6);
      expect(out.warnings[0].level).toBe('warning');
    });

    it(`escalates to violation just past the ${FIELD_VARIANCE_VIOLATION_PCT}% boundary`, () => {
      const out = calcFeederVoltageDropVariance(design, fieldCheck({ pctVd: 12.01 }));
      expect(out.warnings[0].level).toBe('violation');
    });
  });

  describe('design value of exactly 0 (a real state — e.g. a zero-length run)', () => {
    it('reports 0% (finite) variance when the field measurement also reads 0', () => {
      const out = calcFeederVoltageDropVariance(wrap({ pctVdExact: 0 }), fieldCheck({ pctVd: 0 }));
      expect(out.result.percentVariance).toBe(0);
      expect(out.warnings.length).toBe(0);
    });

    it('reports an infinite (undefined-%) variance, flagged as a violation, when a nonzero value is measured against a 0 design', () => {
      const out = calcFeederVoltageDropVariance(wrap({ pctVdExact: 0 }), fieldCheck({ pctVd: 1.5 }));
      expect(out.result.percentVariance).toBe(Number.POSITIVE_INFINITY);
      expect(out.warnings[0].level).toBe('violation');
    });
  });
});

describe('calcPanelBalanceVariance', () => {
  describe('no measurement recorded yet', () => {
    it('throws NoFieldMeasurementError for a 3ph_4w panel missing all three legs', () => {
      const design = calcPanelBalance({ phaseConfig: '3ph_4w', circuits: [{ name: 'L1', va: 1000, tap: 'A' }, { name: 'L2', va: 1000, tap: 'B' }, { name: 'L3', va: 1000, tap: 'C' }] });
      expect(() => calcPanelBalanceVariance(design, '3ph_4w', undefined)).toThrow(NoFieldMeasurementError);
    });

    it('throws for a 3ph_4w panel with A/B measured but C missing — never silently treats an unmeasured leg as 0A', () => {
      const design = calcPanelBalance({ phaseConfig: '3ph_4w', circuits: [{ name: 'L1', va: 1000, tap: 'A' }, { name: 'L2', va: 1000, tap: 'B' }, { name: 'L3', va: 1000, tap: 'C' }] });
      expect(() => calcPanelBalanceVariance(design, '3ph_4w', fieldCheck({ currentA: 10, currentB: 10 }))).toThrow(NoFieldMeasurementError);
    });

    it('a 1ph_3w panel only requires A/B — omitting C is fine, not an error', () => {
      const design = calcPanelBalance({ phaseConfig: '1ph_3w', circuits: [{ name: 'L1', va: 2000, tap: 'A' }, { name: 'L2', va: 1000, tap: 'B' }] });
      const out = calcPanelBalanceVariance(design, '1ph_3w', fieldCheck({ currentA: 20, currentB: 10 }));
      expect(out.result.measuredValue).toBeCloseTo(((20 - 10) / 15) * 100, 6);
    });
  });

  describe('missing design result', () => {
    it('throws MissingRequiredInputError', () => {
      expect(() => calcPanelBalanceVariance(undefined, '3ph_4w', fieldCheck({ currentA: 10, currentB: 10, currentC: 10 }))).toThrow(MissingRequiredInputError);
    });
  });

  describe('hand-derived variance, real panel imbalance (V9 validation figures)', () => {
    // Design imbalance reused from validation.test.ts's V9 case: 29.46%.
    const design = calcPanelBalance({
      phaseConfig: '3ph_4w',
      circuits: [
        { name: 'Lighting A', va: 1200, tap: 'A' }, { name: 'Lighting B', va: 1200, tap: 'B' }, { name: 'Lighting C', va: 1000, tap: 'C' },
        { name: 'HVAC', va: 6000, tap: 'ABC' }, { name: 'Receptacles', va: 1800, tap: 'AB' },
      ],
    });

    it('field-measured currents in the same 4100/4100/3000 proportion reproduce the design imbalance almost exactly', () => {
      // Currents proportional to the design VA at a constant single-phase voltage.
      const out = calcPanelBalanceVariance(design, '3ph_4w', fieldCheck({ currentA: 41, currentB: 41, currentC: 30 }));
      expect(out.result.measuredValue).toBeCloseTo(29.46, 1);
      expect(Math.abs(out.result.percentVariance)).toBeLessThan(1);
      expect(out.warnings.length).toBe(0);
    });

    it('a genuinely rebalanced field measurement (near 0% imbalance) reports a large negative variance and a violation', () => {
      const out = calcPanelBalanceVariance(design, '3ph_4w', fieldCheck({ currentA: 37, currentB: 37, currentC: 37 }));
      expect(out.result.measuredValue).toBeCloseTo(0, 6);
      expect(out.result.percentVariance).toBeCloseTo(-100, 6);
      expect(out.warnings[0].level).toBe('violation');
    });
  });

  describe('perfectly balanced design (0% imbalance — a common, not rare, state)', () => {
    const design = calcPanelBalance({ phaseConfig: '3ph_4w', circuits: [{ name: 'L1', va: 100, tap: 'A' }, { name: 'L2', va: 100, tap: 'B' }, { name: 'L3', va: 100, tap: 'C' }] });

    it('measuring perfectly balanced currents in the field confirms 0% (finite) variance', () => {
      const out = calcPanelBalanceVariance(design, '3ph_4w', fieldCheck({ currentA: 5, currentB: 5, currentC: 5 }));
      expect(out.result.designValue).toBe(0);
      expect(out.result.percentVariance).toBe(0);
    });

    it('measuring an imbalance in the field against a 0%-imbalance design reports an infinite variance, flagged as a violation', () => {
      const out = calcPanelBalanceVariance(design, '3ph_4w', fieldCheck({ currentA: 10, currentB: 5, currentC: 5 }));
      expect(out.result.percentVariance).toBe(Number.POSITIVE_INFINITY);
      expect(out.warnings[0].level).toBe('violation');
    });
  });
});

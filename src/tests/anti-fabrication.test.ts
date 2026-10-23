/**
 * Proves the "no silent defaults / no fabrication" requirements are
 * enforced at runtime, not just in code review.
 */
import { describe, it, expect } from 'vitest';
import { calcVoltageDrop } from '../core/calc/voltageDrop';
import { sizeConductor } from '../core/calc/conductorSizing';
import { resolveMotorLra } from '../core/tables/table430';
import { lookupTable9 } from '../core/tables/chapter9';
import { calcFeederVoltageDropVariance, calcPanelBalanceVariance } from '../core/calc/fieldVariance';
import { calcPanelBalance } from '../core/calc/panelBalance';
import { MissingRequiredInputError, UnverifiedTableValueError, NoFieldMeasurementError } from '../core/domain/errors';
import { ENGINE_VERSION, type CalcResult } from '../core/domain/trace';

describe('anti-fabrication guards', () => {
  it('Missing powerFactor throws MissingRequiredInputError', () => {
    expect(() =>
      // @ts-expect-error intentional omission to test guard
      calcVoltageDrop({ size: '1/0', material: 'Cu', ampacityDesignCurrent: 100, lengthFt: 100, phase: '3ph', conduitMagnetic: true, nominalVoltage: 480, conductorOperatingTempC: 75, parallelSets: 1 })
    ).toThrow(MissingRequiredInputError);
  });

  it('LRA resolution with no nameplate/code-letter/design-letter source throws, does not fabricate', () => {
    expect(() => resolveMotorLra({ hp: 50, flc: 65, voltage: 460, phase: 3 })).toThrow(UnverifiedTableValueError);
  });

  it('Table 9 lookup for a size outside the tabulated range (2000 kcmil, table stops at 1000) throws', () => {
    expect(() => lookupTable9('2000', 'Cu', true)).toThrow(UnverifiedTableValueError);
  });

  it('sizeConductor with missing targetPctVd throws', () => {
    expect(() =>
      // @ts-expect-error intentional omission
      sizeConductor({ continuousAmps: 100, noncontinuousAmps: 0, material: 'Cu', insulationRatedTemp: 90, terminationTempRating: 75, ambientTempC: 30, cccCount: 3, phase: '3ph', lengthFt: 100, conduitMagnetic: true, powerFactor: 0.9, nominalVoltage: 480, conductorOperatingTempC: 75, parallelSets: 1 })
    ).toThrow(MissingRequiredInputError);
  });

  describe('field verification never fabricates a variance', () => {
    function wrap<T>(result: T): CalcResult<T> {
      return { engineVersion: ENGINE_VERSION, trace: [], result, warnings: [], assumptions: [], codeRefs: [] };
    }

    it('a feeder with a valid design result but no field measurement throws NoFieldMeasurementError, not "0% variance"', () => {
      const design = wrap({ pctVdExact: 2.4 });
      expect(() => calcFeederVoltageDropVariance(design, undefined)).toThrow(NoFieldMeasurementError);
      // Confirms it is specifically the "nothing recorded" case, not a generic failure the UI would render as a scary error.
      expect(() => calcFeederVoltageDropVariance(design, undefined)).toThrow(/not yet verified/i);
    });

    it('a panel with a valid design result but only a partial field measurement (missing the C leg) throws rather than treating the unmeasured leg as 0A', () => {
      const design = calcPanelBalance({ phaseConfig: '3ph_4w', circuits: [{ name: 'L1', va: 1000, tap: 'A' }, { name: 'L2', va: 1000, tap: 'B' }, { name: 'L3', va: 1000, tap: 'C' }] });
      expect(() =>
        calcPanelBalanceVariance(design, '3ph_4w', { id: 'fc', projectId: 'p', nodeId: 'n', subToolId: 'balance', timestamp: new Date().toISOString(), measured: { currentA: 10, currentB: 10 } })
      ).toThrow(NoFieldMeasurementError);
    });

    it('a field measurement with no design result to compare against throws MissingRequiredInputError, not "OK"', () => {
      expect(() =>
        calcFeederVoltageDropVariance(undefined, { id: 'fc', projectId: 'p', nodeId: 'n', subToolId: 'conductor', timestamp: new Date().toISOString(), measured: { pctVd: 2.4 } })
      ).toThrow(MissingRequiredInputError);
    });
  });
});

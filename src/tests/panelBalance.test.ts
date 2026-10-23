import { describe, it, expect } from 'vitest';
import { calcPanelBalance } from '../core/calc/panelBalance';

describe('calcPanelBalance', () => {
  describe('single-phase (1-pole) taps', () => {
    it('sums each single-phase circuit onto its own leg with no cross-leg bleed', () => {
      const out = calcPanelBalance({
        phaseConfig: '3ph_4w',
        circuits: [
          { name: 'L1', va: 1000, tap: 'A' },
          { name: 'L2', va: 1000, tap: 'B' },
          { name: 'L3', va: 1000, tap: 'C' },
        ],
      });
      expect(out.result.phaseVa).toEqual({ A: 1000, B: 1000, C: 1000 });
      expect(out.result.totalVa).toBe(3000);
      expect(out.result.averageVa).toBe(1000);
    });

    it('perfectly balanced load reports 0% imbalance and picks the first phase for both max and min on a tie', () => {
      const out = calcPanelBalance({
        phaseConfig: '3ph_4w',
        circuits: [
          { name: 'L1', va: 100, tap: 'A' },
          { name: 'L2', va: 100, tap: 'B' },
          { name: 'L3', va: 100, tap: 'C' },
        ],
      });
      expect(out.result.imbalancePct).toBe(0);
      expect(out.result.maxPhase).toBe('A');
      expect(out.result.minPhase).toBe('A');
      expect(out.warnings.length).toBe(0);
    });
  });

  describe('2-pole taps', () => {
    it('splits a 2-pole AB circuit\'s VA evenly across A and B, leaving C untouched', () => {
      const out = calcPanelBalance({
        phaseConfig: '3ph_4w',
        circuits: [{ name: 'Dryer', va: 2000, tap: 'AB' }],
      });
      expect(out.result.phaseVa).toEqual({ A: 1000, B: 1000, C: 0 });
    });

    it('splits a 2-pole BC circuit evenly across B and C', () => {
      const out = calcPanelBalance({
        phaseConfig: '3ph_4w',
        circuits: [{ name: 'HVAC-2', va: 1200, tap: 'BC' }],
      });
      expect(out.result.phaseVa).toEqual({ A: 0, B: 600, C: 600 });
    });

    it('splits a 2-pole CA circuit evenly across C and A', () => {
      const out = calcPanelBalance({
        phaseConfig: '3ph_4w',
        circuits: [{ name: 'HVAC-3', va: 1200, tap: 'CA' }],
      });
      expect(out.result.phaseVa).toEqual({ A: 600, B: 0, C: 600 });
    });
  });

  describe('3-pole taps', () => {
    it('splits a 3-pole ABC circuit evenly across all three legs', () => {
      const out = calcPanelBalance({
        phaseConfig: '3ph_4w',
        circuits: [{ name: 'HVAC', va: 6000, tap: 'ABC' }],
      });
      expect(out.result.phaseVa).toEqual({ A: 2000, B: 2000, C: 2000 });
      expect(out.result.imbalancePct).toBe(0);
    });

    it('combines 1-pole, 2-pole, and 3-pole taps on one panel (matches validation case V9)', () => {
      const out = calcPanelBalance({
        phaseConfig: '3ph_4w',
        circuits: [
          { name: 'Lighting A', va: 1200, tap: 'A' },
          { name: 'Lighting B', va: 1200, tap: 'B' },
          { name: 'Lighting C', va: 1000, tap: 'C' },
          { name: 'HVAC', va: 6000, tap: 'ABC' },
          { name: 'Receptacles', va: 1800, tap: 'AB' },
        ],
      });
      expect(out.result.phaseVa.A).toBeCloseTo(4100, 6);
      expect(out.result.phaseVa.B).toBeCloseTo(4100, 6);
      expect(out.result.phaseVa.C).toBeCloseTo(3000, 6);
      expect(out.result.totalVa).toBeCloseTo(11200, 6);
    });
  });

  describe('>20% imbalance warning threshold', () => {
    it('does not warn at exactly 20.0% imbalance (boundary is exclusive)', () => {
      // A=340, B=C=280 -> total=900, avg=300, (340-280)/300*100 = 20.0% exactly.
      const out = calcPanelBalance({
        phaseConfig: '3ph_4w',
        circuits: [
          { name: 'A-leg', va: 340, tap: 'A' },
          { name: 'B-leg', va: 280, tap: 'B' },
          { name: 'C-leg', va: 280, tap: 'C' },
        ],
      });
      expect(out.result.imbalancePct).toBeCloseTo(20, 6);
      expect(out.warnings.some(w => w.level === 'warning')).toBe(false);
    });

    it('warns once imbalance pushes just past 20%', () => {
      // A=341, B=C=280 -> total=901, avg=300.333, (341-280)/300.333*100 ~= 20.31%.
      const out = calcPanelBalance({
        phaseConfig: '3ph_4w',
        circuits: [
          { name: 'A-leg', va: 341, tap: 'A' },
          { name: 'B-leg', va: 280, tap: 'B' },
          { name: 'C-leg', va: 280, tap: 'C' },
        ],
      });
      expect(out.result.imbalancePct).toBeGreaterThan(20);
      const warning = out.warnings.find(w => w.level === 'warning');
      expect(warning).toBeDefined();
      expect(warning!.message).toMatch(/20% engineering guideline/);
    });

    it('does not warn for a mild, sub-20% imbalance', () => {
      const out = calcPanelBalance({
        phaseConfig: '3ph_4w',
        circuits: [
          { name: 'A-leg', va: 1100, tap: 'A' },
          { name: 'B-leg', va: 1000, tap: 'B' },
          { name: 'C-leg', va: 1000, tap: 'C' },
        ],
      });
      expect(out.result.imbalancePct).toBeLessThan(20);
      expect(out.warnings.some(w => w.level === 'warning')).toBe(false);
    });
  });

  describe('1ph_3w (single-phase 3-wire) config', () => {
    it('only averages across A/B, ignoring the unused C leg', () => {
      const out = calcPanelBalance({
        phaseConfig: '1ph_3w',
        circuits: [
          { name: 'L1', va: 2000, tap: 'A' },
          { name: 'L2', va: 1000, tap: 'B' },
        ],
      });
      expect(out.result.phaseVa).toEqual({ A: 2000, B: 1000, C: 0 });
      expect(out.result.totalVa).toBe(3000);
      expect(out.result.averageVa).toBe(1500);
      expect(out.result.maxPhase).toBe('A');
      expect(out.result.minPhase).toBe('B');
    });

    it('throws if any circuit is tapped to phase C', () => {
      expect(() =>
        calcPanelBalance({
          phaseConfig: '1ph_3w',
          circuits: [{ name: 'Bad', va: 1000, tap: 'C' }],
        })
      ).toThrow(/cannot have circuits tapped to phase C/);
    });
  });

  describe('input guards', () => {
    it('throws when circuits is an empty array', () => {
      expect(() => calcPanelBalance({ phaseConfig: '3ph_4w', circuits: [] })).toThrow(
        /At least one circuit is required/
      );
    });
  });

  describe('trace and assumptions', () => {
    it('logs the multi-pole VA-split as an engineering_judgment assumption', () => {
      const out = calcPanelBalance({
        phaseConfig: '3ph_4w',
        circuits: [{ name: 'L1', va: 1000, tap: 'A' }],
      });
      expect(
        out.assumptions.some(
          a => a.kind === 'engineering_judgment' && /split evenly across the phases/.test(a.text)
        )
      ).toBe(true);
    });

    it('emits one trace step per circuit plus the totals and imbalance summary steps', () => {
      const circuits = [
        { name: 'L1', va: 1000, tap: 'A' as const },
        { name: 'L2', va: 1000, tap: 'B' as const },
      ];
      const out = calcPanelBalance({ phaseConfig: '3ph_4w', circuits });
      expect(out.trace.length).toBe(circuits.length + 2);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { calcDownstreamScc, checkInterruptingRating } from '../core/calc/transformer';

describe('calcDownstreamScc (point-to-point method)', () => {
  // Formula under test (confirmed against the Bussmann SPD / IEEE 241-242
  // point-to-point method, see VERIFICATION.md): f = 1.73 x L x I / (C x N),
  // M = 1/(1+f), Isc_downstream = Isc_upstream x M. No voltage term.

  it('matches a hand-derived f/M/Isc for a single conductor run', () => {
    // L=100ft, I=20000A, C=20000, N=1 -> f = 1.732*100*20000/20000 = 173.2
    const out = calcDownstreamScc({ upstreamIsc: 20000, lengthFt: 100, conductorConstantC: 20000, parallelSets: 1 });
    const expectedF = (1.732 * 100 * 20000) / 20000;
    const expectedM = 1 / (1 + expectedF);
    expect(out.result.f).toBeCloseTo(expectedF, 6);
    expect(out.result.m).toBeCloseTo(expectedM, 6);
    expect(out.result.downstreamIsc).toBeCloseTo(20000 * expectedM, 6);
  });

  it('does not divide by voltage (the corrected bug) — result depends only on L, I, C, N', () => {
    const out = calcDownstreamScc({ upstreamIsc: 10000, lengthFt: 50, conductorConstantC: 10000, parallelSets: 2 });
    // f = 1.732*50*10000/(10000*2) = 43.3
    expect(out.result.f).toBeCloseTo(43.3, 6);
    expect(out.result.m).toBeCloseTo(1 / 44.3, 6);
    expect(out.result.downstreamIsc).toBeCloseTo(10000 / 44.3, 6);
  });

  it('more parallel sets reduce f and raise downstream Isc (less attenuation)', () => {
    const oneSet = calcDownstreamScc({ upstreamIsc: 15000, lengthFt: 75, conductorConstantC: 22000, parallelSets: 1 });
    const twoSets = calcDownstreamScc({ upstreamIsc: 15000, lengthFt: 75, conductorConstantC: 22000, parallelSets: 2 });
    expect(twoSets.result.f).toBeCloseTo(oneSet.result.f / 2, 6);
    expect(twoSets.result.downstreamIsc).toBeGreaterThan(oneSet.result.downstreamIsc);
  });

  it('a zero-length conductor run has no attenuation (f=0, M=1, downstream Isc = upstream Isc)', () => {
    const out = calcDownstreamScc({ upstreamIsc: 15000, lengthFt: 0, conductorConstantC: 20000, parallelSets: 1 });
    expect(out.result.f).toBe(0);
    expect(out.result.m).toBe(1);
    expect(out.result.downstreamIsc).toBe(15000);
  });

  it('adds motor contribution as exactly 4x total motor FLA on top of the point-to-point result', () => {
    const withoutMotor = calcDownstreamScc({ upstreamIsc: 20000, lengthFt: 100, conductorConstantC: 20000, parallelSets: 1 });
    const withMotor = calcDownstreamScc({
      upstreamIsc: 20000, lengthFt: 100, conductorConstantC: 20000, parallelSets: 1,
      includeMotorContribution: { totalMotorFla: 50 },
    });
    expect(withMotor.result.downstreamIscWithMotorContribution).toBeCloseTo(withoutMotor.result.downstreamIsc + 4 * 50, 6);
    expect(withMotor.assumptions.some(a => a.kind === 'engineering_judgment' && /4.*FLA/.test(a.text))).toBe(true);
  });

  it('omits downstreamIscWithMotorContribution when no motor contribution is requested', () => {
    const out = calcDownstreamScc({ upstreamIsc: 20000, lengthFt: 100, conductorConstantC: 20000, parallelSets: 1 });
    expect(out.result.downstreamIscWithMotorContribution).toBeUndefined();
  });

  it('logs the conductor constant C used as an explicit assumption, never silently defaulted', () => {
    const out = calcDownstreamScc({ upstreamIsc: 20000, lengthFt: 100, conductorConstantC: 22800, parallelSets: 1 });
    const assumption = out.assumptions.find(a => a.kind === 'other');
    expect(assumption).toBeDefined();
    expect(assumption!.text).toContain('22800');
    expect(assumption!.text).toMatch(/point-to-point method/);
  });
});

describe('checkInterruptingRating', () => {
  it('returns a violation warning when available fault current exceeds the device rating', () => {
    const warnings = checkInterruptingRating(25000, 22000);
    expect(warnings.length).toBe(1);
    expect(warnings[0].level).toBe('violation');
    expect(warnings[0].message).toMatch(/25000|25,000/);
  });

  it('returns no warnings when the device rating is sufficient', () => {
    expect(checkInterruptingRating(18000, 22000)).toEqual([]);
  });

  it('returns no warnings at exactly the rated value (not a violation)', () => {
    expect(checkInterruptingRating(22000, 22000)).toEqual([]);
  });
});

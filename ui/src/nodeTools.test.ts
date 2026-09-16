import { describe, it, expect } from 'vitest';
import { NODE_TOOLS, motorChildVa, bomRowsForNode, bomRowFromTools, type RunContext, type SubTool } from './nodeTools';
import type { OneLineNode } from '../../src/core/domain/node';
import { OutOfTableRangeError } from '../../src/core/domain/errors';

function fakeNode(overrides: Partial<OneLineNode>): OneLineNode {
  return {
    id: 'n1', projectId: 'p1', parentId: null, type: 'load', name: 'Node',
    order: 0, data: {}, result: null, createdAt: '', updatedAt: '',
    ...overrides,
  };
}

const balanceTool = NODE_TOOLS.panel.find(t => t.id === 'balance')!;

function runBalance(children: OneLineNode[], data: Record<string, any> = { phaseConfig: '3ph_4w', manualCircuits: [] }) {
  const panelNode = fakeNode({ id: 'panel1', type: 'panel', name: 'Panel' });
  const ctx: RunContext = { node: panelNode, parent: null, children };
  return balanceTool.run(data, ctx);
}

describe('motorChildVa', () => {
  it('computes 3-phase VA from the motor node\'s hp/voltage via Table 430.250 FLC', () => {
    // 50 HP, 460V -> FLC 65A (same figures as validation case V4) -> VA = sqrt(3)*460*65
    const motor = fakeNode({ type: 'motor', data: { hp: '50', voltage: '460' } });
    const va = motorChildVa(motor);
    expect(va).toBeCloseTo(Math.sqrt(3) * 460 * 65, 4);
  });

  it('throws (does not fabricate) for an HP/voltage combo outside the verified Table 430.250 subset', () => {
    const motor = fakeNode({ type: 'motor', data: { hp: '999', voltage: '460' } });
    expect(() => motorChildVa(motor)).toThrow(OutOfTableRangeError);
  });
});

describe('panel balance tool includes Motor-type children, not just Load', () => {
  it('adds a Load child on its stored tap and a Motor child split evenly across A/B/C', () => {
    const load = fakeNode({ id: 'l1', type: 'load', name: 'Lighting', data: { va: 1200, tap: 'A' } });
    const motor = fakeNode({ id: 'm1', type: 'motor', name: 'Compressor', data: { hp: '50', voltage: '460' } });
    const out = runBalance([load, motor]);

    const motorVa = Math.sqrt(3) * 460 * 65;
    // Load: all 1200 VA on A. Motor: motorVa/3 on each of A, B, C.
    expect(out.result.phaseVa.A).toBeCloseTo(1200 + motorVa / 3, 4);
    expect(out.result.phaseVa.B).toBeCloseTo(motorVa / 3, 4);
    expect(out.result.phaseVa.C).toBeCloseTo(motorVa / 3, 4);
  });

  it('ignores non-load/motor children (e.g. a nested Feeder) entirely', () => {
    const load = fakeNode({ id: 'l1', type: 'load', name: 'Lighting', data: { va: 500, tap: 'A' } });
    const feeder = fakeNode({ id: 'f1', type: 'feeder', name: 'Sub-feeder' });
    const out = runBalance([load, feeder]);
    // Only the Load's 500 VA counts; the Feeder contributes nothing and isn't in the trace.
    expect(out.result.totalVa).toBe(500);
    expect(out.trace.some(t => t.step.includes('Sub-feeder'))).toBe(false);
  });

  it('propagates an unverified motor HP/voltage as a real error rather than silently zeroing its VA', () => {
    const badMotor = fakeNode({ id: 'm2', type: 'motor', data: { hp: '999', voltage: '460' } });
    expect(() => runBalance([badMotor])).toThrow(OutOfTableRangeError);
  });

  it('combines Load, Motor, and manual circuits together', () => {
    const load = fakeNode({ id: 'l1', type: 'load', name: 'Lighting', data: { va: 1000, tap: 'B' } });
    const motor = fakeNode({ id: 'm1', type: 'motor', name: 'Fan', data: { hp: '5', voltage: '230' } });
    const out = runBalance([load, motor], {
      phaseConfig: '3ph_4w',
      manualCircuits: [{ name: 'Manual', va: 300, tap: 'C' }],
    });
    // 3 circuits total: 1 load + 1 motor + 1 manual.
    expect(out.trace.filter(t => t.step.startsWith('Circuit')).length).toBe(3);
  });
});

describe('bomRowFromTools / bomRowsForNode (Schedule / bill-of-materials rollup)', () => {
  it('returns [] for a tool list where no sub-tool declares bomRow', () => {
    const plainTool: SubTool = {
      id: 'x', label: 'X', eyebrow: '', blurb: '', defaultData: {}, fields: [],
      run: () => { throw new Error('not used'); }, metric: () => ({ value: '', unit: '', label: '' }), rows: () => [],
    };
    expect(bomRowFromTools([plainTool], {}, null)).toEqual([]);
  });

  it('a single-subtool node type (utility) reads its spec from the cached .result, not from recomputing', () => {
    const node = fakeNode({ type: 'utility', data: { sourceVoltage: '480', availableFaultCurrentA: '25000' }, result: { sourceVoltage: 480, availableFaultCurrentA: 25000 } });
    const rows = bomRowsForNode(node);
    expect(rows).toEqual([
      { label: 'Voltage', value: '480 V' },
      { label: 'Available fault current', value: '25,000 A' },
    ]);
  });

  it('a node with no .result yet shows a graceful placeholder instead of crashing or fabricating a number', () => {
    const node = fakeNode({ type: 'utility', data: { sourceVoltage: '480', availableFaultCurrentA: '25000' }, result: null });
    const rows = bomRowsForNode(node);
    expect(rows).toEqual([
      { label: 'Voltage', value: 'not yet calculated' },
      { label: 'Available fault current', value: 'not yet calculated' },
    ]);
  });

  it('transformer spec (kVA/voltage) comes from persisted input data, since it is not part of TransformerSizingResult', () => {
    const node = fakeNode({ type: 'transformer', data: { kva: '1000', primaryVoltage: '13800', secondaryVoltage: '480' }, result: null });
    expect(bomRowsForNode(node)).toEqual([
      { label: 'Rating', value: '1000 kVA' },
      { label: 'Voltage', value: '13800/480 V' },
    ]);
  });

  it('a multi-subtool node type (panel) reads the Phase-balance sub-tool specifically, not the Load-calc sub-tool sharing the same node', () => {
    // Namespaced data: node.data holds one key per sub-tool id (`load`, `balance`) since Panel has two sub-tools.
    const node = fakeNode({
      type: 'panel',
      data: { load: { occupancy: 'office', areaFt2: '2000' }, balance: { phaseConfig: '1ph_3w', manualCircuits: [] } },
      result: { imbalancePct: 12.5 },
    });
    expect(bomRowsForNode(node)).toEqual([
      { label: 'Configuration', value: '1φ, 3-wire' },
      { label: 'Phase imbalance', value: '12.5%' },
    ]);
  });

  it('feeder spec (conductor size + OCPD) falls back to a placeholder when .result belongs to the feeder\'s other sub-tool (Fault current)', () => {
    const node = fakeNode({
      type: 'feeder',
      data: { conductor: { continuousAmps: '80' }, scc: { upstreamIsc: '20000' } },
      result: { downstreamIsc: 18000 }, // shape from the "scc" sub-tool, not "conductor"
    });
    expect(bomRowsForNode(node)).toEqual([
      { label: 'Conductor size', value: 'not yet calculated' },
      { label: 'OCPD', value: 'not yet calculated' },
    ]);
  });

  it('motor spec (HP) comes from persisted input data, since MotorStartingResult does not echo it back', () => {
    const node = fakeNode({ type: 'motor', data: { hp: '50', voltage: '460' }, result: null });
    expect(bomRowsForNode(node)).toEqual([{ label: 'Rating', value: '50 HP, 460 V' }]);
  });

  it('load spec (VA) reads from .result (wrapAsResult mirrors entered VA into the result 1:1)', () => {
    const node = fakeNode({ type: 'load', data: { va: '1500', tap: 'A' }, result: { va: 1500, tap: 'A' } });
    expect(bomRowsForNode(node)).toEqual([{ label: 'Load', value: '1500 VA' }]);
  });
});

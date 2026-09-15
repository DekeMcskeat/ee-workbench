import { requireDefined } from '../domain/errors';
import { CalcResult, CalcWarning, TraceStep, ENGINE_VERSION, Assumption } from '../domain/trace';

export type PanelPhaseTap = 'A' | 'B' | 'C' | 'AB' | 'BC' | 'CA' | 'ABC';

export interface PanelCircuit {
  name: string;
  va: number;
  tap: PanelPhaseTap;
}

export interface PanelBalanceInput {
  circuits: PanelCircuit[];
  phaseConfig: '1ph_3w' | '3ph_4w'; // single-phase 3-wire (A/B split) vs 3-phase 4-wire (A/B/C)
}

export interface PanelBalanceResult {
  phaseVa: { A: number; B: number; C: number };
  totalVa: number;
  averageVa: number;
  maxPhase: 'A' | 'B' | 'C';
  minPhase: 'A' | 'B' | 'C';
  imbalancePct: number;
}

/**
 * A multi-pole circuit's VA is split evenly across the phases it spans —
 * a 2-pole (AB/BC/CA) circuit's nameplate VA is divided by 2 per leg, a
 * 3-pole (ABC) circuit's by 3. This is standard panel-schedule practice;
 * it is NOT a distinct NEC-tabulated rule, so it is logged as an
 * engineering_judgment assumption rather than presented as a code citation.
 */
function distributeAcrossPhases(circuit: PanelCircuit): Partial<Record<'A' | 'B' | 'C', number>> {
  const phases = circuit.tap.split('') as ('A' | 'B' | 'C')[];
  const share = circuit.va / phases.length;
  const out: Partial<Record<'A' | 'B' | 'C', number>> = {};
  for (const p of phases) out[p] = (out[p] ?? 0) + share;
  return out;
}

export function calcPanelBalance(input: PanelBalanceInput): CalcResult<PanelBalanceResult> {
  const trace: TraceStep[] = [];
  const warnings: CalcWarning[] = [];
  const assumptions: Assumption[] = [];

  const circuits = requireDefined(input.circuits, 'circuits');
  if (circuits.length === 0) {
    throw new Error('At least one circuit is required to compute panel phase balance.');
  }

  const phaseVa = { A: 0, B: 0, C: 0 };
  for (const c of circuits) {
    const dist = distributeAcrossPhases(c);
    for (const p of ['A', 'B', 'C'] as const) {
      if (dist[p]) phaseVa[p] += dist[p]!;
    }
    trace.push({
      step: `Circuit "${c.name}" (${c.va} VA, tap ${c.tap})`,
      substitution: c.tap.length > 1 ? `${c.va} / ${c.tap.length} poles -> ${(c.va / c.tap.length).toFixed(1)} VA per leg on ${c.tap.split('').join(', ')}` : `${c.va} VA on ${c.tap}`,
      resultValue: c.va,
      resultUnit: 'VA',
    });
  }

  if (input.phaseConfig === '1ph_3w' && phaseVa.C > 0) {
    throw new Error('Single-phase 3-wire panel (phaseConfig 1ph_3w) cannot have circuits tapped to phase C. Use A/B/AB taps only, or switch phaseConfig to 3ph_4w.');
  }

  assumptions.push({
    kind: 'engineering_judgment',
    text: 'Multi-pole circuit VA is split evenly across the phases it spans for phase-balance purposes. This is standard panel-schedule practice, not a distinct NEC-tabulated rule.',
  });

  const activePhases: ('A' | 'B' | 'C')[] = input.phaseConfig === '1ph_3w' ? ['A', 'B'] : ['A', 'B', 'C'];
  const totalVa = activePhases.reduce((s, p) => s + phaseVa[p], 0);
  const averageVa = totalVa / activePhases.length;

  let maxPhase: 'A' | 'B' | 'C' = activePhases[0];
  let minPhase: 'A' | 'B' | 'C' = activePhases[0];
  for (const p of activePhases) {
    if (phaseVa[p] > phaseVa[maxPhase]) maxPhase = p;
    if (phaseVa[p] < phaseVa[minPhase]) minPhase = p;
  }

  const imbalancePct = averageVa > 0 ? ((phaseVa[maxPhase] - phaseVa[minPhase]) / averageVa) * 100 : 0;

  trace.push({
    step: 'Per-phase totals',
    substitution: activePhases.map(p => `${p}=${phaseVa[p].toFixed(0)}VA`).join(', '),
    resultValue: totalVa,
    resultUnit: 'VA',
  });
  trace.push({
    step: 'Phase imbalance',
    formulaLatex: '\\%Imbalance = (VA_{max} - VA_{min}) / VA_{avg} \\times 100',
    substitution: `(${phaseVa[maxPhase].toFixed(0)} - ${phaseVa[minPhase].toFixed(0)}) / ${averageVa.toFixed(0)} × 100`,
    resultValue: imbalancePct,
    resultUnit: '%',
  });

  // NEC does not mandate a numeric panel-phase-imbalance limit; 20% is a widely-used
  // engineering rule of thumb for balanced-design practice, not a code citation.
  if (imbalancePct > 20) {
    warnings.push({
      level: 'warning',
      message: `Phase imbalance (${imbalancePct.toFixed(1)}%) exceeds the common 20% engineering guideline for balanced panel loading. This is a design recommendation, not an NEC violation — rebalance circuit taps if practical.`,
    });
  }

  return {
    engineVersion: ENGINE_VERSION,
    trace,
    result: { phaseVa, totalVa, averageVa, maxPhase, minPhase, imbalancePct },
    warnings,
    assumptions,
    codeRefs: [],
  };
}

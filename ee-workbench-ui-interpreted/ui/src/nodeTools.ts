/**
 * Config-driven mapping of one-line node type -> calculator sub-tool(s).
 * Each sub-tool describes its own form fields, default data, the kernel
 * calc function it runs, and how to summarize the result for the result
 * card. This keeps the node detail pane generic (one form renderer, one
 * result renderer) instead of hand-duplicating JSX per node type.
 */
import { calcLoad } from '../../src/core/calc/loadCalc';
import { sizeConductor } from '../../src/core/calc/conductorSizing';
import { sizeTransformer, calcDownstreamScc, checkInterruptingRating } from '../../src/core/calc/transformer';
import { calcMotorStarting } from '../../src/core/calc/motorStarting';
import { calcPanelBalance, PanelCircuit, PanelPhaseTap } from '../../src/core/calc/panelBalance';
import type { CalcResult, Assumption } from '../../src/core/domain/trace';
import { ENGINE_VERSION } from '../../src/core/domain/trace';
import type { NodeType, OneLineNode } from '../../src/core/domain/node';
import { motorVoltages, tempRatings, materials } from './constants';

export type FieldType = 'number' | 'text' | 'select' | 'checkbox';
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  suffix?: string;
  options?: { value: string; label: string }[];
  showIf?: (data: Record<string, any>) => boolean;
  span2?: boolean;
  /** Marks this field eligible for a "use parent's fault current" pull button. */
  pull?: 'faultCurrent';
}

export interface RunContext {
  node: OneLineNode;
  parent: OneLineNode | null;
  children: OneLineNode[];
}

export interface SubTool {
  id: string;
  label: string;
  eyebrow: string;
  blurb: string;
  defaultData: Record<string, any>;
  fields: FieldDef[];
  /** True for sub-tools with bespoke (non-field-driven) forms, rendered specially by the UI. */
  custom?: boolean;
  run: (data: Record<string, any>, ctx: RunContext) => CalcResult<any>;
  metric: (result: any) => { value: string; unit: string; label: string; danger?: boolean };
  rows: (result: any) => { label: string; value: string }[];
}

/** Wraps plain entered/derived values into a CalcResult so every node type — even ones with no real "calculation" — shares the same audit-trail UI. */
export function wrapAsResult(entries: { label: string; value: number | string; unit?: string }[], result: Record<string, any>, note: string): CalcResult<any> {
  return {
    engineVersion: ENGINE_VERSION,
    trace: entries.map(e => ({ step: e.label, resultValue: e.value, resultUnit: e.unit })),
    result,
    warnings: [],
    assumptions: [{ kind: 'user_override', text: note } as Assumption],
    codeRefs: [],
  };
}

/**
 * Checks every currently-visible numeric field has a value that parses to a
 * finite number before the calc even runs. Blank numeric inputs coerce to 0
 * via `+value` (not NaN), which would otherwise silently compute a
 * misleading "valid" result (e.g. "0.00% voltage drop") instead of telling
 * the user a field needs a value. Returns the label of the first field that
 * fails, or null if everything visible is fine.
 */
export function firstInvalidNumericField(fields: FieldDef[], data: Record<string, any>): string | null {
  for (const f of fields) {
    if (f.type !== 'number') continue;
    if (f.showIf && !f.showIf(data)) continue;
    const raw = data[f.key];
    if (raw === undefined || raw === null || raw === '' || !Number.isFinite(+raw)) {
      return f.label;
    }
  }
  return null;
}

/** Looks in a node's cached result for a value usable as an upstream available fault current. */
export function resolveParentFaultCurrent(parent: OneLineNode | null): number | undefined {
  const r = parent?.result as Record<string, any> | undefined;
  if (!r) return undefined;
  if (typeof r.availableFaultCurrentA === 'number') return r.availableFaultCurrentA; // utility source
  if (typeof r.secondaryAvailableFaultCurrent === 'number') return r.secondaryAvailableFaultCurrent; // transformer
  if (typeof r.downstreamIscWithMotorContribution === 'number') return r.downstreamIscWithMotorContribution; // upstream feeder SCC
  if (typeof r.downstreamIsc === 'number') return r.downstreamIsc; // upstream feeder SCC
  return undefined;
}

const utilityTool: SubTool = {
  id: 'source', label: 'Source parameters', eyebrow: 'ONE-LINE SOURCE', blurb: 'Utility (or other upstream) source voltage and available fault current feeding this one-line.',
  defaultData: { sourceVoltage: '480', availableFaultCurrentA: '25000' },
  fields: [
    { key: 'sourceVoltage', label: 'Source voltage', type: 'number', suffix: 'V' },
    { key: 'availableFaultCurrentA', label: 'Available fault current', type: 'number', suffix: 'A' },
  ],
  run: (data) => wrapAsResult(
    [{ label: 'Source voltage', value: +data.sourceVoltage, unit: 'V' }, { label: 'Available fault current', value: +data.availableFaultCurrentA, unit: 'A' }],
    { sourceVoltage: +data.sourceVoltage, availableFaultCurrentA: +data.availableFaultCurrentA },
    'Utility source parameters as entered, not derived from a utility fault-duty study. Confirm with the serving utility before final design; downstream nodes can pull this value.',
  ),
  metric: (r) => ({ value: r.availableFaultCurrentA.toLocaleString(), unit: 'A', label: 'available fault current' }),
  rows: (r) => [{ label: 'Source voltage', value: `${r.sourceVoltage} V` }],
};

const transformerTool: SubTool = {
  id: 'transformer', label: 'Transformer sizing', eyebrow: 'TABLE 450.3(B)', blurb: 'FLA and point-to-point available fault current at the secondary.',
  defaultData: { kva: '1000', primaryVoltage: '13800', secondaryVoltage: '480', phase: '3ph', percentZ: '5.75' },
  fields: [
    { key: 'kva', label: 'Rating', type: 'number', suffix: 'kVA' },
    { key: 'phase', label: 'System', type: 'select', options: [{ value: '3ph', label: '3-phase' }, { value: '1ph', label: 'Single-phase' }] },
    { key: 'primaryVoltage', label: 'Primary voltage', type: 'number', suffix: 'V' },
    { key: 'secondaryVoltage', label: 'Secondary voltage', type: 'number', suffix: 'V' },
    { key: 'percentZ', label: 'Impedance (%Z)', type: 'number', suffix: '%' },
  ],
  run: (data) => sizeTransformer({ kva: +data.kva, primaryVoltage: +data.primaryVoltage, secondaryVoltage: +data.secondaryVoltage, phase: data.phase, percentZ: +data.percentZ }),
  metric: (r) => ({ value: r.secondaryAvailableFaultCurrent.toFixed(0), unit: 'A', label: 'secondary available fault current' }),
  rows: (r) => [{ label: 'Primary FLA', value: `${r.primaryFla.toFixed(2)} A` }, { label: 'Secondary FLA', value: `${r.secondaryFla.toFixed(1)} A` }],
};

const panelLoadTool: SubTool = {
  id: 'load', label: 'Load calc', eyebrow: 'TABLE 220.12 · 220.14(I) · 430.250', blurb: "This panel's own connected load (lighting, receptacles, misc., one motor).",
  defaultData: { occupancy: 'office', areaFt2: '2000', receptacleYokeCount: '40', miscVa: '10000', includeMotor: false, motorHp: '3', motorVoltage: '208' },
  fields: [
    { key: 'occupancy', label: 'Occupancy (220.12)', type: 'select', options: [{ value: 'office', label: 'Office (3.5 VA/ft²)' }, { value: 'warehouse_storage', label: 'Warehouse / storage (0.25 VA/ft²)' }] },
    { key: 'areaFt2', label: 'Floor area', type: 'number', suffix: 'ft²' },
    { key: 'receptacleYokeCount', label: 'Receptacle yokes', type: 'number' },
    { key: 'miscVa', label: 'Misc. equipment load', type: 'number', suffix: 'VA' },
    { key: 'includeMotor', label: 'Include one motor (3-phase FLC, Table 430.250)', type: 'checkbox', span2: true },
    { key: 'motorHp', label: 'Motor HP', type: 'number', showIf: (d) => d.includeMotor },
    { key: 'motorVoltage', label: 'Motor voltage', type: 'select', options: motorVoltages.map(v => ({ value: v, label: `${v}V` })), showIf: (d) => d.includeMotor },
  ],
  run: (data) => calcLoad({
    occupancy: data.occupancy, areaFt2: +data.areaFt2, receptacleYokeCount: +data.receptacleYokeCount, miscVa: +data.miscVa,
    motors: data.includeMotor ? [{ hp: data.motorHp, voltage: +data.motorVoltage, phase: 3 }] : [],
  }),
  metric: (r) => ({ value: (r.connectedVa / 1000).toFixed(2), unit: 'kVA', label: 'connected load' }),
  rows: (r) => [{ label: 'Lighting', value: `${r.lightingVa.toFixed(0)} VA` }, { label: 'Receptacles', value: `${r.receptacleVa.toFixed(0)} VA` }, { label: 'Misc.', value: `${r.miscVa.toFixed(0)} VA` }, { label: 'Motor', value: `${r.motorVa.toFixed(0)} VA` }],
};

const panelBalanceTool: SubTool = {
  id: 'balance', label: 'Phase balance', eyebrow: 'PANEL SCHEDULE', blurb: 'A/B/C phase loading, auto-populated from this panel\'s branch-circuit children.',
  defaultData: { phaseConfig: '3ph_4w', manualCircuits: [] as PanelCircuit[] },
  fields: [],
  custom: true,
  run: (data, ctx) => {
    const childRows: PanelCircuit[] = ctx.children.filter(c => c.type === 'load').map(c => ({
      name: c.name, va: Number((c.data as any).va) || 0, tap: ((c.data as any).tap as PanelPhaseTap) || 'A',
    }));
    const manual: PanelCircuit[] = (data.manualCircuits ?? []) as PanelCircuit[];
    return calcPanelBalance({ phaseConfig: data.phaseConfig, circuits: [...childRows, ...manual] });
  },
  metric: (r) => ({ value: r.imbalancePct.toFixed(1), unit: '%', label: 'phase imbalance', danger: r.imbalancePct > 20 }),
  rows: (r) => [{ label: 'Phase A', value: `${r.phaseVa.A.toFixed(0)} VA` }, { label: 'Phase B', value: `${r.phaseVa.B.toFixed(0)} VA` }, { label: 'Phase C', value: `${r.phaseVa.C.toFixed(0)} VA` }],
};

const feederConductorTool: SubTool = {
  id: 'conductor', label: 'Conductor sizing', eyebrow: 'TABLE 310.16 · 310.15 · 250.122', blurb: 'Iterative ampacity + voltage-drop sizing, EGC and OCPD.',
  defaultData: { continuousAmps: '80', noncontinuousAmps: '0', material: 'Cu', insulationRatedTemp: '90', terminationTempRating: '75', ambientTempC: '30', cccCount: '3', targetPctVd: '3', phase: '3ph', lengthFt: '150', conduitMagnetic: 'false', powerFactor: '0.9', nominalVoltage: '480', conductorOperatingTempC: '75', parallelSets: '1' },
  fields: [
    { key: 'continuousAmps', label: 'Continuous load', type: 'number', suffix: 'A' },
    { key: 'noncontinuousAmps', label: 'Noncontinuous load', type: 'number', suffix: 'A' },
    { key: 'material', label: 'Conductor material', type: 'select', options: materials },
    { key: 'insulationRatedTemp', label: 'Insulation rating', type: 'select', options: tempRatings.map(t => ({ value: t, label: `${t}°C` })) },
    { key: 'terminationTempRating', label: 'Termination rating (110.14(C))', type: 'select', options: tempRatings.map(t => ({ value: t, label: `${t}°C` })) },
    { key: 'ambientTempC', label: 'Ambient temp.', type: 'number', suffix: '°C' },
    { key: 'cccCount', label: 'Current-carrying conductors', type: 'number' },
    { key: 'phase', label: 'System', type: 'select', options: [{ value: '3ph', label: '3-phase' }, { value: '1ph', label: 'Single-phase' }] },
    { key: 'lengthFt', label: 'One-way length', type: 'number', suffix: 'ft' },
    { key: 'conduitMagnetic', label: 'Raceway', type: 'select', options: [{ value: 'false', label: 'Non-magnetic' }, { value: 'true', label: 'Steel / magnetic' }] },
    { key: 'powerFactor', label: 'Power factor', type: 'number' },
    { key: 'nominalVoltage', label: 'Nominal voltage', type: 'number', suffix: 'V' },
    { key: 'targetPctVd', label: 'Target voltage drop', type: 'number', suffix: '%' },
    { key: 'conductorOperatingTempC', label: 'Operating temp.', type: 'number', suffix: '°C' },
    { key: 'parallelSets', label: 'Parallel sets', type: 'number' },
  ],
  run: (data) => sizeConductor({
    continuousAmps: +data.continuousAmps, noncontinuousAmps: +data.noncontinuousAmps, material: data.material,
    insulationRatedTemp: +data.insulationRatedTemp, terminationTempRating: +data.terminationTempRating,
    ambientTempC: +data.ambientTempC, cccCount: +data.cccCount, targetPctVd: +data.targetPctVd, phase: data.phase,
    lengthFt: +data.lengthFt, conduitMagnetic: data.conduitMagnetic === 'true', powerFactor: +data.powerFactor,
    nominalVoltage: +data.nominalVoltage, conductorOperatingTempC: +data.conductorOperatingTempC, parallelSets: +data.parallelSets,
  }),
  metric: (r) => ({ value: r.chosenSize, unit: +r.chosenSize > 4 ? 'kcmil' : 'AWG', label: `chosen size · ${r.iterations} iteration${r.iterations === 1 ? '' : 's'}` }),
  rows: (r) => [{ label: 'Design current', value: `${r.designCurrent.toFixed(1)} A` }, { label: 'Final ampacity', value: `${r.finalAmpacity.toFixed(1)} A` }, { label: '%VD (exact)', value: `${r.pctVdExact.toFixed(2)}%` }, { label: 'EGC size', value: r.egcSize }, { label: 'OCPD', value: `${r.ocpdSize} A` }],
};

const feederSccTool: SubTool = {
  id: 'scc', label: 'Fault current', eyebrow: 'POINT-TO-POINT METHOD', blurb: 'Downstream available fault current at the far end of this feeder, and an interrupting-rating check.',
  defaultData: { upstreamIsc: '20000', lineToLineVoltage: '480', conductorConstantC: '', lengthFt: '100', parallelSets: '1', includeMotorContribution: false, totalMotorFla: '0', deviceInterruptingRating: '' },
  fields: [
    { key: 'upstreamIsc', label: 'Upstream available fault current', type: 'number', suffix: 'A', pull: 'faultCurrent' },
    { key: 'lineToLineVoltage', label: 'Line-to-line voltage', type: 'number', suffix: 'V' },
    { key: 'conductorConstantC', label: 'Conductor constant C [VERIFY before use]', type: 'number' },
    { key: 'lengthFt', label: 'One-way length', type: 'number', suffix: 'ft' },
    { key: 'parallelSets', label: 'Parallel sets', type: 'number' },
    { key: 'includeMotorContribution', label: 'Include motor contribution (4x FLA, engineering approximation)', type: 'checkbox', span2: true },
    { key: 'totalMotorFla', label: 'Total downstream motor FLA', type: 'number', suffix: 'A', showIf: (d) => d.includeMotorContribution },
    { key: 'deviceInterruptingRating', label: 'Device interrupting rating (optional check)', type: 'number', suffix: 'A' },
  ],
  run: (data) => {
    if (!data.conductorConstantC) {
      throw new Error('Enter a verified point-to-point conductor constant C for this size/material — this build does not fabricate a default (see README: transformer.ts C-value gap). Common references: IEEE/Bussmann point-to-point method tables.');
    }
    const out = calcDownstreamScc({
      upstreamIsc: +data.upstreamIsc, lengthFt: +data.lengthFt, lineToLineVoltage: +data.lineToLineVoltage,
      conductorConstantC: +data.conductorConstantC, parallelSets: +data.parallelSets,
      includeMotorContribution: data.includeMotorContribution ? { totalMotorFla: +data.totalMotorFla } : undefined,
    });
    if (data.deviceInterruptingRating) {
      const isc = out.result.downstreamIscWithMotorContribution ?? out.result.downstreamIsc;
      out.warnings.push(...checkInterruptingRating(isc, +data.deviceInterruptingRating));
    }
    return out;
  },
  metric: (r) => ({ value: (r.downstreamIscWithMotorContribution ?? r.downstreamIsc).toFixed(0), unit: 'A', label: 'downstream available fault current' }),
  rows: (r) => [{ label: 'f-factor', value: r.f.toFixed(4) }, { label: 'M multiplier', value: r.m.toFixed(4) }],
};

const motorTool: SubTool = {
  id: 'motor', label: 'Motor starting', eyebrow: 'TABLE 430.250 · NEMA MG 1', blurb: 'Starting current and voltage dip at the motor terminals and upstream bus.',
  defaultData: { hp: '50', voltage: '460', lraSource: 'design_letter', nameplateLra: '', nemaDesignLetter: 'B', startingMethod: 'DOL', currentLimitMultipleOfFlc: '4', sourceAvailableFaultCurrentA: '25000', feederMaterial: 'Cu', feederSize: '1/0', lengthFt: '100', conduitMagnetic: 'true', conductorOperatingTempC: '75', parallelSets: '1' },
  fields: [
    { key: 'hp', label: 'Motor HP', type: 'number' },
    { key: 'voltage', label: 'System voltage', type: 'select', options: motorVoltages.map(v => ({ value: v, label: `${v}V, 3-phase` })) },
    { key: 'lraSource', label: 'LRA source', type: 'select', options: [{ value: 'design_letter', label: 'NEMA design-letter rule of thumb' }, { value: 'nameplate', label: 'Manufacturer nameplate' }] },
    { key: 'nameplateLra', label: 'Nameplate LRA', type: 'number', suffix: 'A', showIf: (d) => d.lraSource === 'nameplate' },
    { key: 'nemaDesignLetter', label: 'NEMA design letter', type: 'select', options: [{ value: 'B', label: 'B (~6-7x FLC)' }, { value: 'C', label: 'C (~4.5-5x FLC)' }, { value: 'D', label: 'D (~6-8x FLC)' }], showIf: (d) => d.lraSource !== 'nameplate' },
    { key: 'startingMethod', label: 'Starting method', type: 'select', options: [{ value: 'DOL', label: 'Across-the-line (DOL)' }, { value: 'star_delta', label: 'Star-delta' }, { value: 'soft_start', label: 'Soft starter' }, { value: 'VFD', label: 'VFD' }] },
    { key: 'currentLimitMultipleOfFlc', label: 'Current limit setpoint', type: 'number', suffix: '× FLC', showIf: (d) => d.startingMethod === 'soft_start' || d.startingMethod === 'VFD' },
    { key: 'sourceAvailableFaultCurrentA', label: 'Source available fault current', type: 'number', suffix: 'A', pull: 'faultCurrent' },
    { key: 'feederMaterial', label: 'Feeder material', type: 'select', options: materials },
    { key: 'feederSize', label: 'Feeder size', type: 'select', options: ['12', '10', '8', '6', '4', '2', '1/0', '4/0', '250', '500'].map(s => ({ value: s, label: s })) },
    { key: 'lengthFt', label: 'Feeder length', type: 'number', suffix: 'ft' },
    { key: 'conduitMagnetic', label: 'Raceway', type: 'select', options: [{ value: 'false', label: 'Non-magnetic' }, { value: 'true', label: 'Steel / magnetic' }] },
    { key: 'conductorOperatingTempC', label: 'Operating temp.', type: 'number', suffix: '°C' },
    { key: 'parallelSets', label: 'Parallel sets', type: 'number' },
  ],
  run: (data) => calcMotorStarting({
    hp: data.hp, voltage: +data.voltage, phase: 3,
    nameplateLra: data.lraSource === 'nameplate' ? +data.nameplateLra : undefined,
    nemaDesignLetter: data.lraSource === 'nameplate' ? undefined : data.nemaDesignLetter,
    startingMethod: data.startingMethod,
    currentLimitMultipleOfFlc: data.startingMethod === 'soft_start' || data.startingMethod === 'VFD' ? +data.currentLimitMultipleOfFlc : undefined,
    sourceAvailableFaultCurrentA: +data.sourceAvailableFaultCurrentA,
    feeder: { size: data.feederSize, material: data.feederMaterial, lengthFt: +data.lengthFt, conduitMagnetic: data.conduitMagnetic === 'true', conductorOperatingTempC: +data.conductorOperatingTempC, parallelSets: +data.parallelSets },
  }),
  metric: (r) => ({ value: r.terminalVoltageDipPct.toFixed(2), unit: '%', label: 'terminal starting dip', danger: r.terminalVoltageDipPct > 15 }),
  rows: (r) => [{ label: 'FLC', value: `${r.flc.toFixed(1)} A` }, { label: `LRA (${r.lraSource.replace(/_/g, ' ')})`, value: `${r.lra.toFixed(1)} A` }, { label: 'Actual starting current', value: `${r.actualStartingCurrent.toFixed(1)} A` }, { label: 'Bus dip', value: `${r.busVoltageDipPct.toFixed(2)}%` }],
};

const loadBranchTool: SubTool = {
  id: 'branch', label: 'Branch circuit', eyebrow: 'PANEL SCHEDULE INPUT', blurb: "This circuit's VA and phase tap — feeds its parent panel's Phase Balance tab automatically.",
  defaultData: { va: '1500', tap: 'A', continuous: false },
  fields: [
    { key: 'va', label: 'Load', type: 'number', suffix: 'VA' },
    { key: 'tap', label: 'Phase tap', type: 'select', options: ['A', 'B', 'C', 'AB', 'BC', 'CA', 'ABC'].map(t => ({ value: t, label: t })) },
    { key: 'continuous', label: 'Continuous load (3+ hours)', type: 'checkbox', span2: true },
  ],
  run: (data) => wrapAsResult(
    [{ label: 'Branch load', value: +data.va, unit: 'VA' }, { label: 'Phase tap', value: data.tap }],
    { va: +data.va, tap: data.tap, continuous: !!data.continuous },
    'Single branch-circuit VA as entered — feeds the parent panel\'s Phase Balance tab automatically. Apply 125% continuous-load factor upstream, at the feeder/OCPD sizing step, per 210.19(A)(1).',
  ),
  metric: (r) => ({ value: r.va.toFixed(0), unit: 'VA', label: 'branch load' }),
  rows: (r) => [{ label: 'Phase tap', value: r.tap }, { label: 'Continuous', value: r.continuous ? 'Yes' : 'No' }],
};

export const NODE_TOOLS: Record<NodeType, SubTool[]> = {
  utility: [utilityTool],
  transformer: [transformerTool],
  panel: [panelLoadTool, panelBalanceTool],
  feeder: [feederConductorTool, feederSccTool],
  motor: [motorTool],
  load: [loadBranchTool],
};

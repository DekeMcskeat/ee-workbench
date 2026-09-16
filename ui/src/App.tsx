import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, BookOpen, Cable, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, FileDown, FileText,
  Gauge, Layers3, Lightbulb, Menu, Moon, Network, PanelLeftClose, Pencil, Plug, Plus, RotateCw,
  Settings2, Sparkles, Activity, Sun, Table2, Trash2, Zap, Building2, X,
} from 'lucide-react';
import { calcVoltageDrop } from '../../src/core/calc/voltageDrop';
import { calcConduitFill } from '../../src/core/calc/conduitFill';
import { sizeConductor } from '../../src/core/calc/conductorSizing';
import { calcLoad } from '../../src/core/calc/loadCalc';
import { sizeTransformer } from '../../src/core/calc/transformer';
import { calcPfCorrection } from '../../src/core/calc/pfCorrection';
import { calcMotorStarting } from '../../src/core/calc/motorStarting';
import type { CalcResult } from '../../src/core/domain/trace';
import { listProjects, createProject, renameProject, deleteProject, getActiveProjectId, setActiveProjectId, updateProjectBranding, type Project, type ProjectBranding } from '../../src/core/persistence/projectStore';
import { ALLOWED_CHILDREN, NODE_TYPE_LABEL, type NodeType, type OneLineNode } from '../../src/core/domain/node';
import { listNodesForProject, createNode, updateNodeData, updateNodeResult, renameNode as renameNodeStore, deleteNode as deleteNodeStore } from '../../src/core/persistence/nodeStore';
import { NODE_TOOLS, resolveParentFaultCurrent, motorChildVa, bomRowsForNode, type FieldDef, type SubTool } from './nodeTools';
import type { PanelCircuit } from '../../src/core/calc/panelBalance';
import { panelScheduleCsv, calcTraceCsv, fieldCheckHistoryCsv, bomCsv, type BomEntry } from '../../src/core/report/csv';
import type { FieldCheckHistoryRow } from '../../src/core/calc/fieldVariance';
import { listFieldChecksForNode } from '../../src/core/persistence/fieldCheckStore';
import { sizes, allSizes, motorVoltages, tempRatings, materials } from './constants';
import { presentError, fmt, hasNonFiniteNumber, InputValidationError, type PresentedError } from './errorPresentation';
import { firstInvalidNumericField } from './nodeTools';
import { Input, Select, downloadBlob, ErrorState, WARNING_STYLE, AuditModal } from './uiKit';
import { FieldView } from './FieldView';
import { fieldViewHash, shortNodeRef, parseFieldViewHash, findNodeByShortRef } from './nodeRef';

type Tool = 'voltage' | 'conduit' | 'conductor' | 'load' | 'transformer' | 'pf' | 'motor';
type View = 'workbench' | 'oneline' | 'field' | 'schedule';

const TOOLS: { id: Tool; label: string; icon: typeof Gauge; eyebrow: string; blurb: string }[] = [
  { id: 'voltage', label: 'Voltage drop', icon: Gauge, eyebrow: 'CHAPTER 9 · TABLE 9', blurb: 'Two-method %VD check against a project target.' },
  { id: 'conduit', label: 'Conduit fill', icon: Layers3, eyebrow: 'CHAPTER 9 · TABLES 1, 4 & 5', blurb: 'Check conductor area against raceway fill limits.' },
  { id: 'conductor', label: 'Conductor sizing', icon: Cable, eyebrow: 'TABLE 310.16 · 310.15 · 250.122', blurb: 'Iterative ampacity + VD sizing, EGC and OCPD.' },
  { id: 'load', label: 'Load calc', icon: Building2, eyebrow: 'TABLE 220.12 · 220.14(I) · 430.250', blurb: 'Branch and feeder connected load.' },
  { id: 'transformer', label: 'Transformer', icon: Zap, eyebrow: 'TABLE 450.3(B)', blurb: 'FLA and point-to-point available fault current.' },
  { id: 'pf', label: 'Power factor', icon: Activity, eyebrow: 'ARTICLE 460', blurb: 'Capacitor kVAR sizing and harmonic resonance check.' },
  { id: 'motor', label: 'Motor starting', icon: RotateCw, eyebrow: 'TABLE 430.250 · NEMA MG 1', blurb: 'Starting current and voltage dip, source + feeder.' },
];

const NODE_TYPE_ICON: Record<NodeType, typeof Gauge> = { utility: Plug, transformer: Zap, panel: Building2, feeder: Cable, motor: RotateCw, load: Lightbulb };
const PHASE_TAPS = ['A', 'B', 'C', 'AB', 'BC', 'CA', 'ABC'];

const vdDefault = { size: '4', material: 'Cu', ampacityDesignCurrent: '85', lengthFt: '180', phase: '3ph', conduitMagnetic: 'false', powerFactor: '.9', nominalVoltage: '480', conductorOperatingTempC: '75', parallelSets: '1', targetPctVd: '3' };
const fillDefault = { size: '3', count: '6', tradeSize: '1-1/2', isNipple: false };
const condDefault = { continuousAmps: '80', noncontinuousAmps: '0', material: 'Cu', insulationRatedTemp: '90', terminationTempRating: '75', ambientTempC: '30', cccCount: '3', targetPctVd: '3', phase: '3ph', lengthFt: '150', conduitMagnetic: 'false', powerFactor: '0.9', nominalVoltage: '480', conductorOperatingTempC: '75', parallelSets: '1' };
const loadDefault = { occupancy: 'office', areaFt2: '2000', receptacleYokeCount: '40', miscVa: '10000', includeMotor: true, motorHp: '3', motorVoltage: '208' };
const xfmrDefault = { kva: '1000', primaryVoltage: '13800', secondaryVoltage: '480', phase: '3ph', percentZ: '5.75' };
const pfDefault = { kw: '500', existingPf: '0.80', targetPf: '0.95', kvaScAtBus: '15000' };
const motorDefault = { hp: '50', voltage: '460', lraSource: 'design_letter', nameplateLra: '', nemaDesignLetter: 'B', startingMethod: 'DOL', currentLimitMultipleOfFlc: '4', sourceAvailableFaultCurrentA: '25000', feederMaterial: 'Cu', feederSize: '1/0', lengthFt: '100', conduitMagnetic: 'true', conductorOperatingTempC: '75', parallelSets: '1' };

type Theme = 'dark' | 'light';

export function App() {
  // The inline script in index.html already set document.documentElement.dataset.theme
  // before first paint (saved localStorage choice, else OS preference, else dark) —
  // this just reads that back into React state so the toggle button reflects it.
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* localStorage unavailable — theme still applies for this session */ }
    setTheme(next);
  };

  const [view, setView] = useState<View>('oneline');
  const [tool, setTool] = useState<Tool>('voltage');
  const [railOpen, setRailOpen] = useState(true);
  const [showAudit, setShowAudit] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [infoPanel, setInfoPanel] = useState<'standards' | 'help' | null>(null);
  const [notice, setNotice] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);

  useEffect(() => {
    // Guarded against React StrictMode's dev-mode double-invoke: without the
    // `cancelled` checks, two concurrent effect runs can each see zero
    // projects and both call createProject(), producing two "Untitled
    // Project" rows. Each check runs right after the preceding await so the
    // superseded run bails out before its next persistence call, not just
    // before its final setState.
    let cancelled = false;
    (async () => {
      let all = await listProjects();
      if (cancelled) return;
      if (all.length === 0) all = [await createProject('Untitled Project')];
      if (cancelled) return;
      const storedActive = await getActiveProjectId();
      if (cancelled) return;
      const active = (storedActive && all.find(p => p.id === storedActive)) ? storedActive : all[0].id;
      void setActiveProjectId(active);
      setProjects(all);
      setActiveProjectIdState(active);
    })();
    return () => { cancelled = true; };
  }, []);

  const activeProject = projects.find(p => p.id === activeProjectId) ?? null;

  const selectProject = (id: string) => { void setActiveProjectId(id); setActiveProjectIdState(id); };
  const addProject = async (name: string) => {
    const p = await createProject(name || `Project ${projects.length + 1}`);
    setProjects(await listProjects());
    selectProject(p.id);
  };
  const rename = async (id: string, name: string) => { await renameProject(id, name); setProjects(await listProjects()); };
  const updateBranding = async (id: string, branding: ProjectBranding) => { await updateProjectBranding(id, branding); setProjects(await listProjects()); };
  const removeProject = async (id: string) => {
    await deleteProject(id);
    let all = await listProjects();
    if (all.length === 0) all = [await createProject('Untitled Project')];
    setProjects(all);
    if (activeProjectId === id) selectProject(all[0].id);
  };

  // --- One-line node tree state ---
  const [nodes, setNodes] = useState<OneLineNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [subToolId, setSubToolId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [nodeEditDraft, setNodeEditDraft] = useState('');
  const [fieldSelectedNodeId, setFieldSelectedNodeId] = useState<string | null>(null);

  // Deep link support: a "#field/<shortRef>" hash (see ui/src/nodeRef.ts) —
  // e.g. from a QR code or a link shared with a field engineer — jumps
  // straight to that node's Field view once it's loaded. Re-runs on `nodes`
  // changes so a hash present before the project finishes loading still
  // resolves once it does.
  useEffect(() => {
    function applyHash() {
      const ref = parseFieldViewHash(window.location.hash);
      if (!ref) return;
      const node = findNodeByShortRef(nodes, ref);
      if (node) { setView('field'); setFieldSelectedNodeId(node.id); }
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [nodes]);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    (async () => {
      const ns = await listNodesForProject(activeProjectId);
      if (cancelled) return;
      setNodes(ns);
      const root = ns.find(n => n.parentId === null);
      setSelectedNodeId(root ? root.id : (ns[0]?.id ?? null));
      setExpanded(new Set(ns.filter(n => n.parentId === null).map(n => n.id)));
      setSubToolId(null);
    })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null;
  const parentNode = selectedNode ? nodes.find(n => n.id === selectedNode.parentId) ?? null : null;
  const childNodes = selectedNode ? nodes.filter(n => n.parentId === selectedNode.id) : [];
  const availableTools: SubTool[] = selectedNode ? NODE_TOOLS[selectedNode.type] : [];
  const activeSubTool: SubTool | null = availableTools.find(t => t.id === subToolId) ?? availableTools[0] ?? null;
  const isNamespaced = availableTools.length > 1;
  const subData: Record<string, any> = !selectedNode || !activeSubTool ? {}
    : isNamespaced ? { ...activeSubTool.defaultData, ...((selectedNode.data as any)?.[activeSubTool.id] ?? {}) }
    : { ...activeSubTool.defaultData, ...(selectedNode.data as any) };

  const updateSubField = (key: string, value: any) => {
    if (!selectedNode || !activeSubTool) return;
    const newSubData = { ...subData, [key]: value };
    const newData = isNamespaced ? { ...(selectedNode.data as any), [activeSubTool.id]: newSubData } : newSubData;
    void updateNodeData(selectedNode.id, newData);
    setNodes(nds => nds.map(n => n.id === selectedNode.id ? { ...n, data: newData } : n));
  };

  const updateChildTap = (childId: string, tap: string) => {
    const child = nodes.find(n => n.id === childId);
    if (!child) return;
    const newData = { ...(child.data as any), tap };
    void updateNodeData(childId, newData);
    setNodes(nds => nds.map(n => n.id === childId ? { ...n, data: newData } : n));
  };

  const onelineResult: CalcResult<any> | { error: PresentedError } | null = useMemo(() => {
    if (!selectedNode || !activeSubTool) return null;
    try {
      if (!activeSubTool.custom) {
        const missing = firstInvalidNumericField(activeSubTool.fields, subData);
        if (missing) throw new InputValidationError(`Enter a value for "${missing}" to calculate.`);
      }
      const out = activeSubTool.run(subData, { node: selectedNode, parent: parentNode, children: childNodes });
      if (hasNonFiniteNumber(out.result)) {
        throw new InputValidationError('One of the fields above (often a value left at zero) makes this calculation undefined — check for a 0 that should be a real value, such as a voltage or length.');
      }
      return out;
    } catch (error) {
      return { error: presentError(error) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, activeSubTool?.id, JSON.stringify(subData), JSON.stringify(childNodes.map(c => ({ id: c.id, data: c.data })))]);

  useEffect(() => {
    if (!selectedNode || !activeSubTool || !onelineResult) return;
    const nextResult = 'error' in onelineResult ? null : onelineResult.result;
    if (JSON.stringify(selectedNode.result) === JSON.stringify(nextResult)) return;
    void updateNodeResult(selectedNode.id, nextResult);
    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, result: nextResult } : n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, activeSubTool?.id, JSON.stringify(subData)]);

  const addNode = async (parentId: string | null, type: NodeType) => {
    if (!activeProjectId) return;
    const siblingCount = nodes.filter(n => n.parentId === parentId).length;
    const created = await createNode(activeProjectId, parentId, type, `${NODE_TYPE_LABEL[type]} ${siblingCount + 1}`);
    setNodes(await listNodesForProject(activeProjectId));
    setSelectedNodeId(created.id);
    setSubToolId(null);
    if (parentId) setExpanded(prev => new Set(prev).add(parentId));
    setAddingUnder(null);
  };
  const renameNodeHandler = (id: string, name: string) => {
    void renameNodeStore(id, name);
    setNodes(nds => nds.map(n => n.id === id ? { ...n, name: name.trim() || n.name } : n));
    setEditingNodeId(null);
  };
  const deleteNodeHandler = async (id: string) => {
    await deleteNodeStore(id);
    const refreshed = activeProjectId ? await listNodesForProject(activeProjectId) : [];
    setNodes(refreshed);
    if (!refreshed.find(n => n.id === selectedNodeId)) {
      const root = refreshed.find(n => n.parentId === null);
      setSelectedNodeId(root ? root.id : (refreshed[0]?.id ?? null));
      setSubToolId(null);
    }
  };
  const toggleExpand = (id: string) => setExpanded(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  const pullValue = activeSubTool?.fields.some(f => f.pull === 'faultCurrent') ? resolveParentFaultCurrent(parentNode) : undefined;
  const pullFieldKey = activeSubTool?.fields.find(f => f.pull === 'faultCurrent')?.key;
  const handlePull = () => { if (pullFieldKey !== undefined && pullValue !== undefined) updateSubField(pullFieldKey, String(pullValue)); };

  /** Field-check history for the currently selected node+sub-tool, compared against the live design result — used by both exports to add an optional extra section, never a separate report. */
  const fieldCheckHistoryForExport = async (): Promise<FieldCheckHistoryRow[]> => {
    if (!selectedNode || !activeSubTool?.fieldCheck || !onelineResult || 'error' in onelineResult) return [];
    const checks = (await listFieldChecksForNode(selectedNode.id)).filter(c => c.subToolId === activeSubTool.id);
    const rows: FieldCheckHistoryRow[] = [];
    for (const c of checks) {
      try {
        const variance = activeSubTool.fieldCheck.computeVariance(onelineResult, c, subData);
        rows.push({
          timestamp: c.timestamp, note: c.note, designValue: variance.result.designValue, measuredValue: variance.result.measuredValue,
          absoluteVariance: variance.result.absoluteVariance, percentVariance: variance.result.percentVariance,
          warningLevel: variance.warnings[0]?.level ?? null,
        });
      } catch { /* skip a historical row that no longer computes (e.g. incomplete legacy data) rather than failing the whole export */ }
    }
    return rows;
  };

  const exportPdf = async () => {
    if (!selectedNode || !activeSubTool || !onelineResult || 'error' in onelineResult) return;
    const { generateCalcPackagePdf } = await import('../../src/core/report/pdf');
    const fieldCheckHistory = await fieldCheckHistoryForExport();
    const bytes = await generateCalcPackagePdf({
      projectName: activeProject?.name ?? 'Untitled project', nodeName: selectedNode.name, calcLabel: activeSubTool.label,
      engineVersion: onelineResult.engineVersion, generatedAt: new Date(), trace: onelineResult.trace, warnings: onelineResult.warnings, assumptions: onelineResult.assumptions,
      fieldCheckHistory, branding: activeProject?.branding,
    });
    downloadBlob(`${selectedNode.name.replace(/\s+/g, '_')}_${activeSubTool.id}.pdf`, new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  };
  /** Same child-Load + manual-circuit assembly the Phase-balance sub-tool's own `run()` uses, for the CSV/PDF exports that need the raw circuit list rather than just the computed PanelBalanceResult. */
  const panelCircuitsForExport = (): PanelCircuit[] => {
    const childRows: PanelCircuit[] = childNodes.filter(c => c.type === 'load').map(c => ({
      name: c.name, va: Number((c.data as any).va) || 0, tap: (c.data as any).tap || 'A',
      breakerA: (c.data as any).breakerA ? Number((c.data as any).breakerA) : undefined,
    }));
    const manual: PanelCircuit[] = (subData.manualCircuits ?? []) as PanelCircuit[];
    return [...childRows, ...manual];
  };

  const exportCsv = async () => {
    if (!selectedNode || !activeSubTool || !onelineResult || 'error' in onelineResult) return;
    let csv: string;
    if (activeSubTool.id === 'balance') {
      csv = panelScheduleCsv(panelCircuitsForExport(), onelineResult.result, activeProject?.branding);
    } else {
      csv = calcTraceCsv(onelineResult, activeProject?.branding);
    }
    const fieldCheckHistory = await fieldCheckHistoryForExport();
    if (fieldCheckHistory.length > 0) csv = `${csv}\n\n${fieldCheckHistoryCsv(fieldCheckHistory)}`;
    downloadBlob(`${selectedNode.name.replace(/\s+/g, '_')}_${activeSubTool.id}.csv`, new Blob([csv], { type: 'text/csv' }));
  };

  const exportPanelDirectory = async () => {
    if (!selectedNode || !activeSubTool || activeSubTool.id !== 'balance' || !onelineResult || 'error' in onelineResult) return;
    const { generatePanelDirectoryPdf } = await import('../../src/core/report/pdf');
    const bytes = await generatePanelDirectoryPdf({
      projectName: activeProject?.name ?? 'Untitled project', panelName: selectedNode.name,
      voltage: subData.voltage ? +subData.voltage : undefined, phaseConfig: subData.phaseConfig,
      mainRatingA: subData.mainRatingA ? +subData.mainRatingA : undefined, generatedAt: new Date(),
      circuits: panelCircuitsForExport(), balance: onelineResult.result, branding: activeProject?.branding,
    });
    downloadBlob(`${selectedNode.name.replace(/\s+/g, '_')}_panel_directory.pdf`, new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  };

  // --- Workbench (quick, project-independent calculators) state ---
  const [vd, setVd] = useState(vdDefault);
  const [fill, setFill] = useState(fillDefault);
  const [cond, setCond] = useState(condDefault);
  const [load, setLoad] = useState(loadDefault);
  const [xfmr, setXfmr] = useState(xfmrDefault);
  const [pfIn, setPfIn] = useState(pfDefault);
  const [motor, setMotor] = useState(motorDefault);

  const wbResult = useMemo((): CalcResult<any> | { error: PresentedError } => {
    try {
      let out: CalcResult<any>;
      if (tool === 'voltage') {
        out = calcVoltageDrop({ ...vd, material: vd.material as 'Cu' | 'Al', phase: vd.phase as '1ph' | '3ph', conduitMagnetic: vd.conduitMagnetic === 'true', ampacityDesignCurrent: +vd.ampacityDesignCurrent, lengthFt: +vd.lengthFt, powerFactor: +vd.powerFactor, nominalVoltage: +vd.nominalVoltage, conductorOperatingTempC: +vd.conductorOperatingTempC, parallelSets: +vd.parallelSets, targetPctVd: +vd.targetPctVd });
      } else if (tool === 'conduit') {
        out = calcConduitFill({ conductors: [{ size: fill.size, count: +fill.count }], conduitType: 'EMT', tradeSize: fill.tradeSize, isNipple: fill.isNipple });
      } else if (tool === 'conductor') {
        out = sizeConductor({
          continuousAmps: +cond.continuousAmps, noncontinuousAmps: +cond.noncontinuousAmps, material: cond.material as 'Cu' | 'Al',
          insulationRatedTemp: +cond.insulationRatedTemp as 60 | 75 | 90, terminationTempRating: +cond.terminationTempRating as 60 | 75 | 90,
          ambientTempC: +cond.ambientTempC, cccCount: +cond.cccCount, targetPctVd: +cond.targetPctVd, phase: cond.phase as '1ph' | '3ph',
          lengthFt: +cond.lengthFt, conduitMagnetic: cond.conduitMagnetic === 'true', powerFactor: +cond.powerFactor,
          nominalVoltage: +cond.nominalVoltage, conductorOperatingTempC: +cond.conductorOperatingTempC, parallelSets: +cond.parallelSets,
        });
      } else if (tool === 'load') {
        out = calcLoad({
          occupancy: load.occupancy as 'office' | 'warehouse_storage', areaFt2: +load.areaFt2, receptacleYokeCount: +load.receptacleYokeCount,
          miscVa: +load.miscVa, motors: load.includeMotor ? [{ hp: load.motorHp, voltage: +load.motorVoltage as any, phase: 3 }] : [],
        });
      } else if (tool === 'transformer') {
        out = sizeTransformer({ kva: +xfmr.kva, primaryVoltage: +xfmr.primaryVoltage, secondaryVoltage: +xfmr.secondaryVoltage, phase: xfmr.phase as '1ph' | '3ph', percentZ: +xfmr.percentZ });
      } else if (tool === 'pf') {
        out = calcPfCorrection({ kw: +pfIn.kw, existingPf: +pfIn.existingPf, targetPf: +pfIn.targetPf, kvaScAtBus: pfIn.kvaScAtBus ? +pfIn.kvaScAtBus : undefined });
      } else {
        out = calcMotorStarting({
          hp: motor.hp, voltage: +motor.voltage as any, phase: 3,
          nameplateLra: motor.lraSource === 'nameplate' ? +motor.nameplateLra : undefined,
          nemaDesignLetter: motor.lraSource === 'design_letter' ? (motor.nemaDesignLetter as 'B' | 'C' | 'D') : undefined,
          startingMethod: motor.startingMethod as 'DOL' | 'star_delta' | 'soft_start' | 'VFD',
          currentLimitMultipleOfFlc: motor.startingMethod === 'soft_start' || motor.startingMethod === 'VFD' ? +motor.currentLimitMultipleOfFlc : undefined,
          sourceAvailableFaultCurrentA: +motor.sourceAvailableFaultCurrentA,
          feeder: { size: motor.feederSize, material: motor.feederMaterial as 'Cu' | 'Al', lengthFt: +motor.lengthFt, conduitMagnetic: motor.conduitMagnetic === 'true', conductorOperatingTempC: +motor.conductorOperatingTempC, parallelSets: +motor.parallelSets },
        });
      }
      if (hasNonFiniteNumber(out.result)) {
        throw new InputValidationError('One of the fields above (often a value left at zero) makes this calculation undefined — check for a 0 that should be a real value, such as a voltage or length.');
      }
      return out;
    } catch (error) { return { error: presentError(error) }; }
  }, [tool, vd, fill, cond, load, xfmr, pfIn, motor]);

  const updateVd = (key: keyof typeof vd) => (value: string) => setVd(current => ({ ...current, [key]: value }));
  const updateCond = (key: keyof typeof cond) => (value: string) => setCond(current => ({ ...current, [key]: value }));
  const updateLoad = (key: keyof typeof load) => (value: string) => setLoad(current => ({ ...current, [key]: value }));
  const updateXfmr = (key: keyof typeof xfmr) => (value: string) => setXfmr(current => ({ ...current, [key]: value }));
  const updatePf = (key: keyof typeof pfIn) => (value: string) => setPfIn(current => ({ ...current, [key]: value }));
  const updateMotor = (key: keyof typeof motor) => (value: string) => setMotor(current => ({ ...current, [key]: value }));

  const run = () => { setNotice('Calculation refreshed · audit trail updated'); window.setTimeout(() => setNotice(''), 2500); };
  const resetAll = () => { setVd(vdDefault); setFill(fillDefault); setCond(condDefault); setLoad(loadDefault); setXfmr(xfmrDefault); setPfIn(pfDefault); setMotor(motorDefault); setNotice('New calculation started'); window.setTimeout(() => setNotice(''), 2500); };

  const isWbError = 'error' in wbResult;
  const activeWbTool = TOOLS.find(t => t.id === tool)!;
  const auditResult: CalcResult<unknown> | null = view === 'workbench' ? (!isWbError ? (wbResult as CalcResult<unknown>) : null) : (onelineResult && !('error' in onelineResult) ? onelineResult : null);

  return <div className="app-shell">
    <aside className={`rail ${railOpen ? '' : 'collapsed'}`}>
      <div className="brand"><div className="brand-mark"><span></span><span></span><span></span></div>{railOpen && <div><b>EE Workbench</b><small>ENGINEERING CALCS</small></div>}</div>
      <nav>
        <button className={`nav-item ${view === 'oneline' ? 'active' : ''}`} onClick={() => setView('oneline')}><Network size={18}/>{railOpen && 'One-line'}</button>
        <button className={`nav-item ${view === 'workbench' ? 'active' : ''}`} onClick={() => setView('workbench')}><Gauge size={18}/>{railOpen && 'Workbench'}</button>
        <button className={`nav-item ${view === 'field' ? 'active' : ''}`} onClick={() => setView('field')}><ClipboardCheck size={18}/>{railOpen && 'Field'}</button>
        <button className={`nav-item ${view === 'schedule' ? 'active' : ''}`} onClick={() => setView('schedule')}><Table2 size={18}/>{railOpen && 'Schedule'}</button>
        <button className="nav-item" onClick={() => setShowProjects(true)}><FileText size={18}/>{railOpen && 'Projects'}</button>
        <button className="nav-item" onClick={() => setInfoPanel('standards')}><BookOpen size={18}/>{railOpen && 'Standards'}</button>
      </nav>
      {railOpen && <div className="rail-note"><Sparkles size={15}/><p><b>Safety-first engine</b>Never interpolates a missing table value.</p></div>}
      <button className="collapse" onClick={() => setRailOpen(!railOpen)}>{railOpen ? <PanelLeftClose size={18}/> : <Menu size={18}/>} {railOpen && 'Collapse sidebar'}</button>
    </aside>
    <main>
      <header><button className="crumb" onClick={() => setShowProjects(true)}><span>Project</span><b>{activeProject?.name ?? '—'}</b><ChevronDown size={15}/></button><div className="header-actions"><button className="icon-button" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="icon-button" aria-label="Help" onClick={() => setInfoPanel('help')}><CircleHelp size={18}/></button><div className="avatar">JA</div></div></header>
      <section className="context">
        <div><p className="eyebrow">{view === 'oneline' ? 'ONE-LINE PROJECT' : view === 'field' ? 'FIELD VERIFICATION' : view === 'schedule' ? 'PROJECT SCHEDULE' : 'QUICK WORKBENCH'}</p><h1>{view === 'oneline' ? <>Design as a <i>connected system.</i></> : view === 'field' ? <>Verify the design <i>against reality.</i></> : view === 'schedule' ? <>Every node, <i>one flat schedule.</i></> : <>Electrical calculations, <i>defensible by design.</i></>}</h1><p className="subhead">{view === 'oneline' ? 'Build a one-line hierarchy — every node keeps its own inputs, results, and audit trail, with fault current and panel loading flowing between linked nodes.' : view === 'field' ? 'Record what was actually measured at a panel or feeder and compare it against the office design — design data is never overwritten from here.' : view === 'schedule' ? 'A project-wide bill of materials rolled up live from every node\'s already-computed result — nothing here is recalculated.' : 'Every result is paired with its inputs, code references, and a transparent calculation trail.'}</p></div>
        {view === 'workbench' && <button className="new-button" onClick={resetAll}><Plus size={18}/> New calculation</button>}
      </section>
      <div className="source-banner"><AlertTriangle size={17}/><span><b>Review table sources before issuing.</b> NEC values are cross-verified transcriptions and must be confirmed against your adopted code book.</span><button onClick={() => setShowAudit(true)}>Review status <ArrowUpRight size={14}/></button></div>

      {view === 'field' ? (
        <FieldView
          projects={projects} activeProjectId={activeProjectId} onSelectProject={selectProject}
          nodes={nodes} selectedNodeId={fieldSelectedNodeId} onSelectNode={setFieldSelectedNodeId}
        />
      ) : view === 'schedule' ? (
        <ScheduleView projectName={activeProject?.name ?? 'Untitled project'} nodes={nodes} branding={activeProject?.branding} />
      ) : view === 'workbench' ? <div className="workspace">
        <section className="calculator-card">
          <div className="tool-tabs">{TOOLS.map(t => <button key={t.id} className={tool === t.id ? 'selected' : ''} onClick={() => setTool(t.id)}><t.icon size={17}/> {t.label}</button>)}</div>
          <div className="card-heading"><div><p className="eyebrow">{activeWbTool.eyebrow}</p><h2>{activeWbTool.label}</h2><p>{activeWbTool.blurb}</p></div><button className="settings" aria-label="Table status" onClick={() => setInfoPanel('standards')}><Settings2 size={17}/></button></div>

          {tool === 'voltage' && <div className="form-grid">
            <Select label="Conductor size" value={vd.size} onChange={updateVd('size')} options={sizes.map(s => ({ value: s, label: `${s} ${+s > 4 ? 'kcmil' : 'AWG'}` }))}/>
            <Select label="Material" value={vd.material} onChange={updateVd('material')} options={materials}/>
            <Input label="Design current" suffix="A" value={vd.ampacityDesignCurrent} onChange={updateVd('ampacityDesignCurrent')}/><Input label="One-way length" suffix="ft" value={vd.lengthFt} onChange={updateVd('lengthFt')}/>
            <Select label="System" value={vd.phase} onChange={updateVd('phase')} options={[{ value: '3ph', label: '3-phase' }, { value: '1ph', label: 'Single-phase' }]}/>
            <Input label="Nominal voltage" suffix="V" value={vd.nominalVoltage} onChange={updateVd('nominalVoltage')}/>
            <Input label="Power factor" value={vd.powerFactor} onChange={updateVd('powerFactor')}/><Input label="Target voltage drop" suffix="%" value={vd.targetPctVd} onChange={updateVd('targetPctVd')}/>
            <Select label="Raceway" value={vd.conduitMagnetic} onChange={updateVd('conduitMagnetic')} options={[{ value: 'false', label: 'Non-magnetic' }, { value: 'true', label: 'Steel / magnetic' }]}/>
            <Input label="Operating temp." suffix="°C" value={vd.conductorOperatingTempC} onChange={updateVd('conductorOperatingTempC')}/>
            <Input label="Parallel sets" value={vd.parallelSets} onChange={updateVd('parallelSets')}/>
          </div>}

          {tool === 'conduit' && <div className="form-grid">
            <Select label="Conductor size" value={fill.size} onChange={v => setFill({ ...fill, size: v })} options={allSizes.map(s => ({ value: s, label: s }))}/>
            <Input label="Conductor count" value={fill.count} onChange={v => setFill({ ...fill, count: v })}/>
            <Select label="Raceway type" value="EMT" onChange={() => {}} options={[{ value: 'EMT', label: 'EMT' }]}/>
            <Select label="Trade size" value={fill.tradeSize} onChange={v => setFill({ ...fill, tradeSize: v })} options={['1/2', '3/4', '1', '1-1/4', '1-1/2', '2', '2-1/2', '3'].map(s => ({ value: s, label: `${s} in.` }))}/>
            <label className="check-field"><input type="checkbox" checked={fill.isNipple} onChange={e => setFill({ ...fill, isNipple: e.target.checked })}/><span><b>24 in. nipple exception</b><small>Uses the 60% fill allowance.</small></span></label>
          </div>}

          {tool === 'conductor' && <div className="form-grid">
            <Input label="Continuous load" suffix="A" value={cond.continuousAmps} onChange={updateCond('continuousAmps')}/>
            <Input label="Noncontinuous load" suffix="A" value={cond.noncontinuousAmps} onChange={updateCond('noncontinuousAmps')}/>
            <Select label="Conductor material" value={cond.material} onChange={updateCond('material')} options={materials}/>
            <Select label="Insulation rating" value={cond.insulationRatedTemp} onChange={updateCond('insulationRatedTemp')} options={tempRatings.map(t => ({ value: t, label: `${t}°C` }))}/>
            <Select label="Termination rating (110.14(C))" value={cond.terminationTempRating} onChange={updateCond('terminationTempRating')} options={tempRatings.map(t => ({ value: t, label: `${t}°C` }))}/>
            <Input label="Ambient temp." suffix="°C" value={cond.ambientTempC} onChange={updateCond('ambientTempC')}/>
            <Input label="Current-carrying conductors" value={cond.cccCount} onChange={updateCond('cccCount')}/>
            <Select label="System" value={cond.phase} onChange={updateCond('phase')} options={[{ value: '3ph', label: '3-phase' }, { value: '1ph', label: 'Single-phase' }]}/>
            <Input label="One-way length" suffix="ft" value={cond.lengthFt} onChange={updateCond('lengthFt')}/>
            <Select label="Raceway" value={cond.conduitMagnetic} onChange={updateCond('conduitMagnetic')} options={[{ value: 'false', label: 'Non-magnetic' }, { value: 'true', label: 'Steel / magnetic' }]}/>
            <Input label="Power factor" value={cond.powerFactor} onChange={updateCond('powerFactor')}/>
            <Input label="Nominal voltage" suffix="V" value={cond.nominalVoltage} onChange={updateCond('nominalVoltage')}/>
            <Input label="Target voltage drop" suffix="%" value={cond.targetPctVd} onChange={updateCond('targetPctVd')}/>
            <Input label="Operating temp." suffix="°C" value={cond.conductorOperatingTempC} onChange={updateCond('conductorOperatingTempC')}/>
            <Input label="Parallel sets" value={cond.parallelSets} onChange={updateCond('parallelSets')}/>
          </div>}

          {tool === 'load' && <div className="form-grid">
            <Select label="Occupancy (220.12)" value={load.occupancy} onChange={updateLoad('occupancy')} options={[{ value: 'office', label: 'Office (3.5 VA/ft²)' }, { value: 'warehouse_storage', label: 'Warehouse / storage (0.25 VA/ft²)' }]}/>
            <Input label="Floor area" suffix="ft²" value={load.areaFt2} onChange={updateLoad('areaFt2')}/>
            <Input label="Receptacle yokes" value={load.receptacleYokeCount} onChange={updateLoad('receptacleYokeCount')}/>
            <Input label="Misc. equipment load" suffix="VA" value={load.miscVa} onChange={updateLoad('miscVa')}/>
            <label className="check-field"><input type="checkbox" checked={load.includeMotor} onChange={e => setLoad({ ...load, includeMotor: e.target.checked })}/><span><b>Include one motor</b><small>3-phase FLC per Table 430.250.</small></span></label>
            {load.includeMotor && <><Input label="Motor HP" value={load.motorHp} onChange={updateLoad('motorHp')}/><Select label="Motor voltage" value={load.motorVoltage} onChange={updateLoad('motorVoltage')} options={motorVoltages.map(v => ({ value: v, label: `${v}V` }))}/></>}
          </div>}

          {tool === 'transformer' && <div className="form-grid">
            <Input label="Rating" suffix="kVA" value={xfmr.kva} onChange={updateXfmr('kva')}/>
            <Select label="System" value={xfmr.phase} onChange={updateXfmr('phase')} options={[{ value: '3ph', label: '3-phase' }, { value: '1ph', label: 'Single-phase' }]}/>
            <Input label="Primary voltage" suffix="V" value={xfmr.primaryVoltage} onChange={updateXfmr('primaryVoltage')}/>
            <Input label="Secondary voltage" suffix="V" value={xfmr.secondaryVoltage} onChange={updateXfmr('secondaryVoltage')}/>
            <Input label="Impedance (%Z)" suffix="%" value={xfmr.percentZ} onChange={updateXfmr('percentZ')}/>
          </div>}

          {tool === 'pf' && <div className="form-grid">
            <Input label="Real power" suffix="kW" value={pfIn.kw} onChange={updatePf('kw')}/>
            <Input label="Existing power factor" value={pfIn.existingPf} onChange={updatePf('existingPf')}/>
            <Input label="Target power factor" value={pfIn.targetPf} onChange={updatePf('targetPf')}/>
            <Input label="Bus available fault (optional)" suffix="kVA" value={pfIn.kvaScAtBus} onChange={updatePf('kvaScAtBus')}/>
          </div>}

          {tool === 'motor' && <div className="form-grid">
            <Input label="Motor HP" value={motor.hp} onChange={updateMotor('hp')}/>
            <Select label="System voltage" value={motor.voltage} onChange={updateMotor('voltage')} options={motorVoltages.map(v => ({ value: v, label: `${v}V, 3-phase` }))}/>
            <Select label="LRA source" value={motor.lraSource} onChange={updateMotor('lraSource')} options={[{ value: 'design_letter', label: 'NEMA design-letter rule of thumb' }, { value: 'nameplate', label: 'Manufacturer nameplate' }]}/>
            {motor.lraSource === 'nameplate'
              ? <Input label="Nameplate LRA" suffix="A" value={motor.nameplateLra} onChange={updateMotor('nameplateLra')}/>
              : <Select label="NEMA design letter" value={motor.nemaDesignLetter} onChange={updateMotor('nemaDesignLetter')} options={[{ value: 'B', label: 'B (~6-7x FLC)' }, { value: 'C', label: 'C (~4.5-5x FLC)' }, { value: 'D', label: 'D (~6-8x FLC)' }]}/>}
            <Select label="Starting method" value={motor.startingMethod} onChange={updateMotor('startingMethod')} options={[{ value: 'DOL', label: 'Across-the-line (DOL)' }, { value: 'star_delta', label: 'Star-delta' }, { value: 'soft_start', label: 'Soft starter' }, { value: 'VFD', label: 'VFD' }]}/>
            {(motor.startingMethod === 'soft_start' || motor.startingMethod === 'VFD') && <Input label="Current limit setpoint" suffix="× FLC" value={motor.currentLimitMultipleOfFlc} onChange={updateMotor('currentLimitMultipleOfFlc')}/>}
            <Input label="Source available fault current" suffix="A" value={motor.sourceAvailableFaultCurrentA} onChange={updateMotor('sourceAvailableFaultCurrentA')}/>
            <Select label="Feeder material" value={motor.feederMaterial} onChange={updateMotor('feederMaterial')} options={materials}/>
            <Select label="Feeder size" value={motor.feederSize} onChange={updateMotor('feederSize')} options={['12', '10', '8', '6', '4', '2', '1/0', '4/0', '250', '500'].map(s => ({ value: s, label: s }))}/>
            <Input label="Feeder length" suffix="ft" value={motor.lengthFt} onChange={updateMotor('lengthFt')}/>
            <Select label="Raceway" value={motor.conduitMagnetic} onChange={updateMotor('conduitMagnetic')} options={[{ value: 'false', label: 'Non-magnetic' }, { value: 'true', label: 'Steel / magnetic' }]}/>
            <Input label="Operating temp." suffix="°C" value={motor.conductorOperatingTempC} onChange={updateMotor('conductorOperatingTempC')}/>
            <Input label="Parallel sets" value={motor.parallelSets} onChange={updateMotor('parallelSets')}/>
          </div>}

          <div className="form-footer"><span>{notice || 'Inputs are calculated locally — nothing is saved.'}</span><button className="calculate" onClick={run}>Calculate <ArrowUpRight size={17}/></button></div>
        </section>
        <aside className="result-card">
          <WorkbenchResultPanel tool={tool} result={wbResult} onAudit={() => setShowAudit(true)} />
        </aside>
      </div> : <div className="workspace-oneline">
        <section className="tree-card">
          <div className="tree-head">
            <p className="eyebrow">ONE-LINE TREE</p>
            {nodes.length > 0 && <button className="tree-icon-btn" title="Add another utility source" onClick={() => addNode(null, 'utility')}><Plus size={14}/></button>}
          </div>
          <NodeTree
            nodes={nodes} selectedId={selectedNodeId} expanded={expanded} addingUnder={addingUnder}
            editingId={editingNodeId} editDraft={nodeEditDraft}
            onToggleExpand={toggleExpand} onSelect={(id) => { setSelectedNodeId(id); setSubToolId(null); }}
            onStartAdd={setAddingUnder} onCancelAdd={() => setAddingUnder(null)} onConfirmAdd={addNode}
            onStartRename={(id, name) => { setEditingNodeId(id); setNodeEditDraft(name); }}
            onRenameDraftChange={setNodeEditDraft}
            onCommitRename={(cancel) => { if (!cancel && editingNodeId) renameNodeHandler(editingNodeId, nodeEditDraft); else setEditingNodeId(null); }}
            onDelete={deleteNodeHandler}
          />
          {nodes.length === 0 && <button className="calculate wide" onClick={() => addNode(null, 'utility')}><Plus size={16}/> Add utility source</button>}
        </section>

        <section className="calculator-card">
          {!selectedNode || !activeSubTool ? <div className="empty-state"><Network size={28}/><p>Select or create a one-line node to begin.</p></div> : <>
            <div className="tool-tabs">{availableTools.map(t => <button key={t.id} className={activeSubTool.id === t.id ? 'selected' : ''} onClick={() => setSubToolId(t.id)}>{t.label}</button>)}</div>
            <div className="card-heading"><div><p className="eyebrow">{activeSubTool.eyebrow}</p><h2>{selectedNode.name}</h2><p>{activeSubTool.blurb}</p></div></div>
            {parentNode && <div className="node-context">Parent: <b>{parentNode.name}</b> <span>({NODE_TYPE_LABEL[parentNode.type]})</span></div>}

            {activeSubTool.custom ? (
              <PanelBalanceForm subData={subData} children={childNodes} onChangePhaseConfig={v => updateSubField('phaseConfig', v)}
                onAddRow={() => updateSubField('manualCircuits', [...(subData.manualCircuits ?? []), { name: 'New circuit', va: 0, tap: 'A' }])}
                onUpdateRow={(i, row) => { const arr = [...(subData.manualCircuits ?? [])]; arr[i] = row; updateSubField('manualCircuits', arr); }}
                onRemoveRow={(i) => updateSubField('manualCircuits', (subData.manualCircuits ?? []).filter((_: any, idx: number) => idx !== i))}
                onUpdateChildTap={updateChildTap} onChangeField={updateSubField} />
            ) : (
              <NodeForm fields={activeSubTool.fields} data={subData} onChange={updateSubField} pullValue={pullValue} onPull={handlePull} />
            )}
            <div className="form-footer"><span>Saved automatically to this node.</span></div>
          </>}
        </section>
        <aside className="result-card">
          {selectedNode && activeSubTool && <NodeResultPanel tool={activeSubTool} result={onelineResult} onAudit={() => setShowAudit(true)} onExportPdf={exportPdf} onExportCsv={exportCsv} onExportPanelDirectory={exportPanelDirectory} showCsv={activeSubTool.id === 'balance'} nodeId={selectedNode.id} onOpenFieldView={() => { setFieldSelectedNodeId(selectedNode.id); setView('field'); window.location.hash = fieldViewHash(selectedNode.id); }} />}
        </aside>
      </div>}
    </main>
    {showAudit && auditResult && <AuditModal result={auditResult} onClose={() => setShowAudit(false)} />}
    {infoPanel && <InfoModal type={infoPanel} onClose={() => setInfoPanel(null)} />}
    {showProjects && <ProjectsPanel projects={projects} activeId={activeProjectId} onSelect={selectProject} onRename={rename} onDelete={removeProject} onAdd={addProject} onUpdateBranding={updateBranding} onClose={() => setShowProjects(false)} />}
  </div>;
}

// ---------------- One-line tree ----------------

interface TreeSharedProps {
  nodes: OneLineNode[]; selectedId: string | null; expanded: Set<string>; addingUnder: string | null;
  editingId: string | null; editDraft: string;
  onToggleExpand: (id: string) => void; onSelect: (id: string) => void;
  onStartAdd: (id: string | null) => void; onCancelAdd: () => void; onConfirmAdd: (parentId: string | null, type: NodeType) => void;
  onStartRename: (id: string, name: string) => void; onRenameDraftChange: (v: string) => void; onCommitRename: (cancel?: boolean) => void;
  onDelete: (id: string) => void;
}

function NodeTree(props: TreeSharedProps) {
  const roots = props.nodes.filter(n => n.parentId === null).sort((a, b) => a.order - b.order);
  if (roots.length === 0) return null;
  return <ul className="tree-root">{roots.map(r => <NodeTreeItem key={r.id} node={r} depth={0} {...props} />)}</ul>;
}

function NodeTreeItem({ node, depth, ...props }: TreeSharedProps & { node: OneLineNode; depth: number }) {
  const children = props.nodes.filter(n => n.parentId === node.id).sort((a, b) => a.order - b.order);
  const hasChildren = children.length > 0;
  const isExpanded = props.expanded.has(node.id);
  const Icon = NODE_TYPE_ICON[node.type];
  const allowedChildTypes = ALLOWED_CHILDREN[node.type];
  const isEditing = props.editingId === node.id;

  return <li>
    <div className={`tree-row ${node.id === props.selectedId ? 'selected' : ''}`} style={{ paddingLeft: depth * 16 }}>
      <button className="tree-chevron" aria-label={hasChildren ? (isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`) : undefined} onClick={() => hasChildren && props.onToggleExpand(node.id)}>{hasChildren ? (isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>) : <span className="tree-chevron-spacer"/>}</button>
      <Icon size={13} className="tree-icon"/>
      {isEditing
        ? <input autoFocus className="tree-rename" value={props.editDraft} onChange={e => props.onRenameDraftChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') props.onCommitRename(); if (e.key === 'Escape') props.onCommitRename(true); }} onBlur={() => props.onCommitRename()} />
        : <button className="tree-label" onClick={() => props.onSelect(node.id)}>{node.name}</button>}
      <span className="tree-actions">
        {allowedChildTypes.length > 0 && <button className="tree-icon-btn" title="Add child" onClick={() => props.onStartAdd(props.addingUnder === node.id ? null : node.id)}><Plus size={12}/></button>}
        <button className="tree-icon-btn" title="Rename" onClick={() => props.onStartRename(node.id, node.name)}><Pencil size={11}/></button>
        <button className="tree-icon-btn danger" title="Delete" onClick={() => props.onDelete(node.id)}><Trash2 size={11}/></button>
      </span>
    </div>
    {props.addingUnder === node.id && <div className="tree-add-menu" style={{ marginLeft: (depth + 1) * 16 }}>
      {allowedChildTypes.map(t => <button key={t} onClick={() => props.onConfirmAdd(node.id, t)}>{NODE_TYPE_LABEL[t]}</button>)}
      <button className="cancel" onClick={props.onCancelAdd}>Cancel</button>
    </div>}
    {hasChildren && isExpanded && <ul className="tree-children">{children.map(c => <NodeTreeItem key={c.id} node={c} depth={depth + 1} {...props} />)}</ul>}
  </li>;
}

// ---------------- Generic node form ----------------

function NodeForm({ fields, data, onChange, pullValue, onPull }: { fields: FieldDef[]; data: Record<string, any>; onChange: (key: string, value: any) => void; pullValue?: number; onPull: () => void }) {
  return <div className="form-grid">
    {fields.filter(f => !f.showIf || f.showIf(data)).map(f => {
      if (f.type === 'checkbox') {
        return <label key={f.key} className="check-field"><input type="checkbox" checked={!!data[f.key]} onChange={e => onChange(f.key, e.target.checked)}/><span><b>{f.label}</b></span></label>;
      }
      if (f.type === 'select') {
        return <Select key={f.key} label={f.label} value={String(data[f.key] ?? '')} onChange={v => onChange(f.key, v)} options={f.options ?? []}/>;
      }
      return <div key={f.key}>
        <Input label={f.label} suffix={f.suffix} value={data[f.key] ?? ''} onChange={v => onChange(f.key, v)}/>
        {f.pull === 'faultCurrent' && pullValue !== undefined && <button type="button" className="pull-btn" onClick={onPull}>Use parent: {pullValue.toLocaleString()} A</button>}
      </div>;
    })}
  </div>;
}

// ---------------- Panel phase-balance bespoke form ----------------

function PanelBalanceForm({ subData, children, onChangePhaseConfig, onAddRow, onUpdateRow, onRemoveRow, onUpdateChildTap, onChangeField }: {
  subData: Record<string, any>; children: OneLineNode[];
  onChangePhaseConfig: (v: string) => void; onAddRow: () => void; onUpdateRow: (i: number, row: PanelCircuit) => void; onRemoveRow: (i: number) => void;
  onUpdateChildTap: (childId: string, tap: string) => void; onChangeField: (key: string, value: any) => void;
}) {
  const childLoads = children.filter(c => c.type === 'load');
  const childMotors = children.filter(c => c.type === 'motor');
  const manual: PanelCircuit[] = subData.manualCircuits ?? [];
  return <div className="form-grid">
    <Select label="Panel configuration" value={subData.phaseConfig} onChange={onChangePhaseConfig} options={[{ value: '3ph_4w', label: '3-phase, 4-wire (A/B/C)' }, { value: '1ph_3w', label: 'Single-phase, 3-wire (A/B)' }]}/>
    <Input label="Voltage (nameplate, optional)" suffix="V" value={subData.voltage ?? ''} onChange={v => onChangeField('voltage', v)}/>
    <Input label="Main breaker/lugs rating (nameplate, optional)" suffix="A" value={subData.mainRatingA ?? ''} onChange={v => onChangeField('mainRatingA', v)}/>
    <div />
    <div className="panel-schedule-block">
      <b>Branch circuits & motors (linked from child nodes)</b>
      {childLoads.length === 0 && childMotors.length === 0 ? <small>No branch-circuit or motor children yet — use the tree's "+" on this panel to add one.</small> : <table className="mini-table"><thead><tr><th>Circuit</th><th>VA</th><th>Tap</th><th>Breaker</th></tr></thead>
        <tbody>
          {childLoads.map(c => <tr key={c.id}><td>{c.name}</td><td>{Number((c.data as any).va) || 0}</td><td><select value={(c.data as any).tap || 'A'} onChange={e => onUpdateChildTap(c.id, e.target.value)}>{PHASE_TAPS.map(t => <option key={t} value={t}>{t}</option>)}</select></td><td>{(c.data as any).breakerA ? `${(c.data as any).breakerA} A` : '—'}</td></tr>)}
          {childMotors.map(c => {
            let va: number | null = null;
            try { va = motorChildVa(c); } catch { va = null; }
            return <tr key={c.id}><td>{c.name}</td><td>{va !== null ? va.toFixed(0) : 'unverified HP/voltage'}</td><td>ABC (3-phase)</td><td>—</td></tr>;
          })}
        </tbody>
      </table>}
    </div>
    <div className="panel-schedule-block">
      <b>Manual circuits (panel-native, e.g. lighting/misc.)</b>
      <table className="mini-table"><thead><tr><th>Name</th><th>VA</th><th>Tap</th><th>Breaker (A)</th><th/></tr></thead>
        <tbody>{manual.map((row, i) => <tr key={i}>
          <td><input value={row.name} onChange={e => onUpdateRow(i, { ...row, name: e.target.value })}/></td>
          <td><input type="number" value={row.va} onChange={e => onUpdateRow(i, { ...row, va: +e.target.value })}/></td>
          <td><select value={row.tap} onChange={e => onUpdateRow(i, { ...row, tap: e.target.value as PanelCircuit['tap'] })}>{PHASE_TAPS.map(t => <option key={t} value={t}>{t}</option>)}</select></td>
          <td><input type="number" value={row.breakerA ?? ''} onChange={e => onUpdateRow(i, { ...row, breakerA: e.target.value ? +e.target.value : undefined })}/></td>
          <td><button className="row-icon danger" aria-label={`Remove circuit ${row.name || i + 1}`} onClick={() => onRemoveRow(i)}><Trash2 size={13}/></button></td>
        </tr>)}</tbody>
      </table>
      <button type="button" className="calculate" style={{ marginTop: 10 }} onClick={onAddRow}><Plus size={14}/> Add manual circuit</button>
    </div>
  </div>;
}

// ---------------- Schedule (bill of materials) ----------------

/**
 * A project-wide rollup — one flat row per node, from each node's own
 * declared `bomRow` sub-tool (see nodeTools.ts), read from `nodes` (the same
 * live, IndexedDB-backed state every other view reads) so it updates as the
 * project changes without a separate fetch or cache of its own.
 */
function ScheduleView({ projectName, nodes, branding }: { projectName: string; nodes: OneLineNode[]; branding?: ProjectBranding }) {
  const entries: BomEntry[] = nodes
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(n => ({ nodeName: n.name, nodeType: NODE_TYPE_LABEL[n.type], spec: bomRowsForNode(n) }));

  const exportCsv = () => {
    downloadBlob(`${projectName.replace(/\s+/g, '_')}_schedule.csv`, new Blob([bomCsv(entries, branding)], { type: 'text/csv' }));
  };
  const exportPdf = async () => {
    const { generateBomPdf } = await import('../../src/core/report/pdf');
    const bytes = await generateBomPdf({ projectName, generatedAt: new Date(), entries, branding });
    downloadBlob(`${projectName.replace(/\s+/g, '_')}_schedule.pdf`, new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  };

  return <div className="schedule-view">
    <section className="calculator-card">
      <div className="card-heading">
        <div><p className="eyebrow">BILL OF MATERIALS</p><h2>{projectName}</h2><p>{entries.length} node{entries.length === 1 ? '' : 's'} in this project.</p></div>
        {entries.length > 0 && <div className="export-row schedule-export-row">
          <button className="export-btn" onClick={exportPdf}><FileDown size={15}/> PDF</button>
          <button className="export-btn" onClick={exportCsv}><Table2 size={15}/> CSV</button>
        </div>}
      </div>
      {entries.length === 0 ? <div className="empty-state"><Table2 size={28}/><p>No nodes in this project yet — build a one-line first.</p></div> : (
        <table className="mini-table schedule-table">
          <thead><tr><th>Node</th><th>Type</th><th>Spec</th></tr></thead>
          <tbody>{entries.map((e, i) => <tr key={i}>
            <td>{e.nodeName}</td>
            <td>{e.nodeType}</td>
            <td>{e.spec.length ? e.spec.map(s => `${s.label}: ${s.value}`).join(' · ') : <span className="muted">no spec available</span>}</td>
          </tr>)}</tbody>
        </table>
      )}
    </section>
  </div>;
}

// ---------------- Result panels ----------------

function NodeResultPanel({ tool, result, onAudit, onExportPdf, onExportCsv, onExportPanelDirectory, showCsv, nodeId, onOpenFieldView }: { tool: SubTool; result: CalcResult<any> | { error: PresentedError } | null; onAudit: () => void; onExportPdf: () => void; onExportCsv: () => void; onExportPanelDirectory: () => void; showCsv: boolean; nodeId: string; onOpenFieldView: () => void }) {
  const isError = !result || 'error' in result;
  const r = !isError ? (result as CalcResult<any>).result : null;
  const m = r ? tool.metric(r) : null;
  return <>
    <div className="result-top"><div><p className="eyebrow">LIVE RESULT</p><h2>{tool.label}</h2></div>{m && <span className={`status ${m.danger ? 'danger' : 'pass'}`}>{m.danger ? 'Review' : 'Within target'}</span>}</div>
    {isError && <ErrorState error={result && 'error' in result ? result.error : { kind: 'input', heading: 'Nothing to calculate yet', detail: 'Fill in the fields above.' }} />}
    {m && <><div className="main-metric"><strong>{m.value}<small>{m.unit}</small></strong><span>{m.label}</span></div>
      <div className="result-rows">{tool.rows(r).map((row, i) => <div key={i}><span>{row.label}</span><b>{row.value}</b></div>)}</div></>}
    {tool.fieldCheck && <div className="field-ref-strip">
      <span>Field ref <code>{shortNodeRef(nodeId)}</code></span>
      <button type="button" onClick={onOpenFieldView}><ClipboardCheck size={13}/> Open in Field view</button>
    </div>}
    {!isError && <div className="result-actions">
      <button className="audit-link" onClick={onAudit}><ClipboardCheck size={17}/> View calculation trail <ArrowUpRight size={15}/></button>
      <div className="export-row">
        <button className="export-btn" onClick={onExportPdf}><FileDown size={15}/> PDF</button>
        {showCsv && <button className="export-btn" onClick={onExportCsv}><Table2 size={15}/> CSV</button>}
        {showCsv && <button className="export-btn" onClick={onExportPanelDirectory}><FileDown size={15}/> Panel directory</button>}
      </div>
    </div>}
  </>;
}

function WorkbenchResultPanel({ tool, result, onAudit }: { tool: Tool; result: CalcResult<any> | { error: PresentedError }; onAudit: () => void }) {
  const isError = 'error' in result;
  const label = TOOLS.find(t => t.id === tool)!.label;
  const r = !isError ? result.result : null;
  const danger = isError || (r && ('fits' in r && r.fits === false)) || (r && ('terminalVoltageDipPct' in r && r.terminalVoltageDipPct > 15));

  return <>
    <div className="result-top"><div><p className="eyebrow">LIVE RESULT</p><h2>{label}</h2></div><span className={`status ${danger ? 'danger' : 'pass'}`}>{danger ? 'Review' : 'Within target'}</span></div>
    {isError && <ErrorState error={result.error} />}

    {!isError && tool === 'voltage' && <><div className="main-metric"><strong>{fmt(r.pctVdExact)}<small>%</small></strong><span>exact voltage drop</span></div><div className="meter"><i style={{ width: `${Math.min(100, r.pctVdExact / 5 * 100)}%` }}/></div><div className="metric-scale"><span>0%</span><span>3% target</span><span>5%</span></div><div className="result-rows"><div><span>Voltage loss</span><b>{fmt(r.vdExact)} V</b></div><div><span>Approx. method</span><b>{fmt(r.pctVdApprox)}%</b></div><div><span>Resistance, adjusted</span><b>{fmt(r.rAdjustedOhmPerKft, 3)} Ω/kft</b></div></div></>}

    {!isError && tool === 'conduit' && <><div className="main-metric"><strong>{fmt(r.fillPct, 1)}<small>%</small></strong><span>raceway fill</span></div><div className="meter"><i style={{ width: `${Math.min(100, r.fillPct)}%` }}/></div><div className="metric-scale"><span>0%</span><span>{fmt(r.fillLimitPct * 100, 0)}% limit</span><span>100%</span></div><div className="result-rows"><div><span>Conductor area</span><b>{fmt(r.totalConductorArea, 4)} in²</b></div><div><span>Allowed area</span><b>{fmt(r.allowedArea, 4)} in²</b></div><div><span>Conduit area</span><b>{fmt(r.conduitInteriorArea100pct, 3)} in²</b></div></div></>}

    {!isError && tool === 'conductor' && <><div className="main-metric"><strong>{r.chosenSize}</strong><span>{typeof r.chosenSize === 'string' && +r.chosenSize > 4 ? 'kcmil' : 'AWG'} · {r.iterations} iteration{r.iterations === 1 ? '' : 's'}</span></div><div className="result-rows"><div><span>Design current</span><b>{fmt(r.designCurrent, 1)} A</b></div><div><span>Final ampacity</span><b>{fmt(r.finalAmpacity, 1)} A</b></div><div><span>%VD (exact)</span><b>{fmt(r.pctVdExact)}%</b></div><div><span>EGC size</span><b>{r.egcSize}</b></div><div><span>OCPD</span><b>{r.ocpdSize} A</b></div></div></>}

    {!isError && tool === 'load' && <><div className="main-metric"><strong>{fmt(r.connectedVa / 1000)}<small>kVA</small></strong><span>connected load</span></div><div className="result-rows"><div><span>Lighting</span><b>{fmt(r.lightingVa, 0)} VA</b></div><div><span>Receptacles</span><b>{fmt(r.receptacleVa, 0)} VA</b></div><div><span>Misc.</span><b>{fmt(r.miscVa, 0)} VA</b></div><div><span>Motor</span><b>{fmt(r.motorVa, 0)} VA</b></div></div></>}

    {!isError && tool === 'transformer' && <><div className="main-metric"><strong>{fmt(r.secondaryFla, 1)}<small>A</small></strong><span>secondary FLA</span></div><div className="result-rows"><div><span>Primary FLA</span><b>{fmt(r.primaryFla)} A</b></div><div><span>Available fault current</span><b>{fmt(r.secondaryAvailableFaultCurrent, 0)} A</b></div></div></>}

    {!isError && tool === 'pf' && <><div className="main-metric"><strong>{fmt(r.requiredKvar, 1)}<small>kVAR</small></strong><span>required capacitance</span></div><div className="result-rows">{r.resonantHarmonicOrder !== undefined && <div><span>Resonant harmonic order</span><b>h ≈ {fmt(r.resonantHarmonicOrder)}</b></div>}{r.nearProblemHarmonic !== undefined && <div><span>Near problem harmonic</span><b>{r.nearProblemHarmonic}th</b></div>}</div></>}

    {!isError && tool === 'motor' && <><div className="main-metric"><strong>{fmt(r.terminalVoltageDipPct)}<small>%</small></strong><span>terminal starting dip</span></div><div className="meter"><i style={{ width: `${Math.min(100, r.terminalVoltageDipPct / 15 * 100)}%` }}/></div><div className="metric-scale"><span>0%</span><span>15% guideline</span></div><div className="result-rows"><div><span>FLC</span><b>{fmt(r.flc, 1)} A</b></div><div><span>LRA ({r.lraSource.replace(/_/g, ' ')})</span><b>{fmt(r.lra, 1)} A</b></div><div><span>Actual starting current</span><b>{fmt(r.actualStartingCurrent, 1)} A</b></div><div><span>Bus dip</span><b>{fmt(r.busVoltageDipPct)}%</b></div></div></>}

    {!isError && <button className="audit-link" onClick={onAudit}><ClipboardCheck size={17}/> View calculation trail <ArrowUpRight size={15}/></button>}
  </>;
}

// ---------------- Modals ----------------

function ProjectsPanel({ projects, activeId, onSelect, onRename, onDelete, onAdd, onUpdateBranding, onClose }: {
  projects: Project[]; activeId: string | null;
  onSelect: (id: string) => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void; onAdd: (name: string) => void;
  onUpdateBranding: (id: string, branding: ProjectBranding) => void; onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');

  const startEdit = (p: Project) => { setEditingId(p.id); setDraft(p.name); };
  const commitEdit = () => { if (editingId) onRename(editingId, draft); setEditingId(null); };
  const submitNew = () => { if (newName.trim()) { onAdd(newName.trim()); setNewName(''); } };

  const activeProject = projects.find(p => p.id === activeId) ?? null;
  const [firmName, setFirmName] = useState(activeProject?.branding?.firmName ?? '');
  const [licenseOrContact, setLicenseOrContact] = useState(activeProject?.branding?.licenseOrContact ?? '');
  useEffect(() => {
    setFirmName(activeProject?.branding?.firmName ?? '');
    setLicenseOrContact(activeProject?.branding?.licenseOrContact ?? '');
  }, [activeId]);
  const commitBranding = () => { if (activeId) onUpdateBranding(activeId, { firmName, licenseOrContact }); };

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="projects-modal" onMouseDown={e => e.stopPropagation()}>
      <div className="modal-head"><div><p className="eyebrow">PROJECTS</p><h2>Switch or manage projects</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={19}/></button></div>
      <p>Each project keeps its own one-line tree and calculations, saved locally in this browser.</p>
      <ul className="project-list">
        {projects.map(p => <li key={p.id} className={`project-row ${p.id === activeId ? 'active' : ''}`}>
          {editingId === p.id
            ? <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }} onBlur={commitEdit} />
            : <button className="select" onClick={() => onSelect(p.id)}>{p.id === activeId && <span className="active-dot" />}{p.name}</button>}
          {editingId !== p.id && <button className="row-icon" aria-label={`Rename ${p.name}`} onClick={() => startEdit(p)}><Pencil size={14}/></button>}
          <button className="row-icon danger" aria-label={`Delete ${p.name}`} onClick={() => onDelete(p.id)}><Trash2 size={14}/></button>
        </li>)}
      </ul>
      <div className="project-add">
        <input placeholder="New project name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitNew(); }} />
        <button className="calculate" onClick={submitNew}><Plus size={16}/> Add</button>
      </div>
      {activeProject && <div className="branding-block">
        <p className="eyebrow">REPORT BRANDING · {activeProject.name}</p>
        <p className="branding-hint">Applied to this project's PDF/CSV export headers in place of "EE Workbench". Text only — leave blank to use the default.</p>
        <div className="branding-fields">
          <Input label="Firm / company name" value={firmName} onChange={setFirmName} type="text" />
          <Input label="License or contact line" value={licenseOrContact} onChange={setLicenseOrContact} type="text" />
        </div>
        <button className="calculate" onClick={commitBranding}>Save branding</button>
      </div>}
    </section>
  </div>;
}

function InfoModal({ type, onClose }: { type: 'standards' | 'help'; onClose: () => void }) {
  const content = type === 'standards' ? ['STANDARDS STATUS', 'NEC 2023 table coverage', 'This UI exposes only the kernel’s verified subset. Unsupported values are blocked instead of estimated.'] : ['QUICK HELP', 'Use the workbench', 'Build a one-line: select a node in the tree (or add one), fill in its form, and the result card updates live. Panels auto-pull branch-circuit VA from Load children for phase balancing; feeders and motors can pull available fault current from their parent. Export a PDF calc package or CSV from any node.'];
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="info-modal" onMouseDown={e => e.stopPropagation()}><button className="icon-button close-modal" aria-label="Close" onClick={onClose}><X size={19}/></button><p className="eyebrow">{content[0]}</p><h2>{content[1]}</h2><p>{content[2]}</p><button className="calculate" onClick={onClose}>Done</button></section></div>;
}

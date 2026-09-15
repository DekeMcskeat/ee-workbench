import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, ChevronDown, CircleHelp, ClipboardCheck, Gauge, Layers3, Menu, PanelLeftClose, Plus, Search, Sparkles, X } from 'lucide-react';
import { calcVoltageDrop } from '../../src/core/calc/voltageDrop';
import { calcConduitFill } from '../../src/core/calc/conduitFill';
import type { CalcResult } from '../../src/core/domain/trace';
import { db, loadOrCreateProjects, type Project } from './db';

type Tool = 'voltage' | 'conduit';
const sizes = ['12', '10', '8', '6', '4', '2', '1/0', '4/0', '250', '500'];

const Input = ({ label, suffix, value, onChange, type = 'number' }: { label: string; suffix?: string; value: string | number; onChange: (v: string) => void; type?: string }) => (
  <label className="field"><span>{label}</span><div className="input-shell"><input type={type} value={value} onChange={e => onChange(e.target.value)} />{suffix && <em>{suffix}</em>}</div></label>
);

export function App() {
  const [tool, setTool] = useState<Tool>('voltage');
  const [railOpen, setRailOpen] = useState(true);
  const [showAudit, setShowAudit] = useState(false);
  const [notice, setNotice] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | undefined>();
  const [showProjects, setShowProjects] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [vd, setVd] = useState({ size: '4', material: 'Cu', ampacityDesignCurrent: '85', lengthFt: '180', phase: '3ph', conduitMagnetic: 'false', powerFactor: '.9', nominalVoltage: '480', conductorOperatingTempC: '75', parallelSets: '1', targetPctVd: '3' });
  const [fill, setFill] = useState({ size: '3', count: '6', tradeSize: '1-1/2', isNipple: false });

  useEffect(() => {
    void (async () => {
      const saved = await loadOrCreateProjects();
      setActiveProjectId(saved[0].id);
      setProjects(saved);
    })();
  }, []);

  const activeProject = projects.find(project => project.id === activeProjectId);
  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const id = await db.projects.add({ name, jurisdiction: 'US / NEC', codeEdition: 'NEC 2023', createdAt: now, updatedAt: now });
    const saved = await db.projects.orderBy('updatedAt').reverse().toArray();
    setProjects(saved); setActiveProjectId(id); setNewProjectName(''); setShowProjects(false);
    setNotice(`Project “${name}” is now active.`);
  };

  const result = useMemo(() => {
    try {
      return tool === 'voltage'
        ? calcVoltageDrop({ ...vd, material: vd.material as 'Cu', size: vd.size, ampacityDesignCurrent: +vd.ampacityDesignCurrent, lengthFt: +vd.lengthFt, phase: vd.phase as '1ph' | '3ph', conduitMagnetic: vd.conduitMagnetic === 'true', powerFactor: +vd.powerFactor, nominalVoltage: +vd.nominalVoltage, conductorOperatingTempC: +vd.conductorOperatingTempC, parallelSets: +vd.parallelSets, targetPctVd: +vd.targetPctVd })
        : calcConduitFill({ conductors: [{ size: fill.size, count: +fill.count }], conduitType: 'EMT', tradeSize: fill.tradeSize, isNipple: fill.isNipple });
    } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to calculate.' }; }
  }, [tool, vd, fill]);

  const updateVd = (key: keyof typeof vd) => (value: string) => setVd(current => ({ ...current, [key]: value }));
  const isError = 'error' in result;
  const vdResult = !isError && tool === 'voltage' ? result.result : null;
  const fillResult = !isError && tool === 'conduit' ? result.result : null;

  return <div className="app-shell">
    <aside className={`rail ${railOpen ? '' : 'collapsed'}`}>
      <div className="brand"><div className="brand-mark"><span></span><span></span><span></span></div>{railOpen && <div><b>EE Workbench</b><small>ENGINEERING CALCS</small></div>}</div>
      <div className="nav-item active"><Gauge size={18}/>{railOpen && 'Calculator'}</div>
      {railOpen && <div className="rail-note"><Sparkles size={15}/><p><b>Safety-first engine</b>Never interpolates a missing table value.</p></div>}
      <button className="collapse" onClick={() => setRailOpen(!railOpen)}>{railOpen ? <PanelLeftClose size={18}/> : <Menu size={18}/>} {railOpen && 'Collapse sidebar'}</button>
    </aside>
    <main>
      <header><button className="crumb project-switcher" onClick={() => setShowProjects(true)}><span>Project</span><b>{activeProject?.name ?? 'Loading…'}</b><ChevronDown size={15}/></button><div className="header-actions"><button className="icon-button" aria-label="Help" onClick={() => setNotice('Choose a calculator, adjust inputs, and inspect the audit trail for every result.')}><CircleHelp size={18}/></button><div className="avatar">JA</div></div></header>
      <section className="context"><div><p className="eyebrow">DESIGN WORKBENCH</p><h1>Electrical calculations, <i>defensible by design.</i></h1><p className="subhead">Every result is paired with its inputs, code references, and a transparent calculation trail.</p></div><button className="new-button" onClick={() => { setTool('voltage'); setVd({ size: '4', material: 'Cu', ampacityDesignCurrent: '85', lengthFt: '180', phase: '3ph', conduitMagnetic: 'false', powerFactor: '.9', nominalVoltage: '480', conductorOperatingTempC: '75', parallelSets: '1', targetPctVd: '3' }); setNotice('New voltage-drop calculation started'); }}><Plus size={18}/> New calculation</button></section>
      <div className="source-banner"><AlertTriangle size={17}/><span><b>Review table sources before issuing.</b> NEC values are cross-verified transcriptions and must be confirmed against your adopted code book.</span><button onClick={() => setShowAudit(true)}>Review status <ArrowUpRight size={14}/></button></div>
      <div className="workspace">
        <section className="calculator-card">
          <div className="tool-tabs"><button className={tool === 'voltage' ? 'selected' : ''} onClick={() => setTool('voltage')}><Gauge size={17}/> Voltage drop</button><button className={tool === 'conduit' ? 'selected' : ''} onClick={() => setTool('conduit')}><Layers3 size={17}/> Conduit fill</button></div>
          <div className="card-heading"><div><p className="eyebrow">{tool === 'voltage' ? 'CHAPTER 9 · TABLE 9' : 'CHAPTER 9 · TABLES 1, 4 & 5'}</p><h2>{tool === 'voltage' ? 'Voltage drop' : 'Conduit fill'}</h2><p>{tool === 'voltage' ? 'Size conductors against a project voltage-drop target.' : 'Check conductor area against raceway fill limits.'}</p></div></div>
          {tool === 'voltage' ? <div className="form-grid">
            <label className="field"><span>Conductor size</span><div className="select-shell"><select value={vd.size} onChange={e => updateVd('size')(e.target.value)}>{sizes.map(s => <option key={s} value={s}>{s} {+s > 4 ? 'kcmil' : 'AWG'}</option>)}</select></div></label>
            <label className="field"><span>Material</span><div className="select-shell"><select value={vd.material} onChange={e => updateVd('material')(e.target.value)}><option>Cu</option></select></div></label>
            <Input label="Design current" suffix="A" value={vd.ampacityDesignCurrent} onChange={updateVd('ampacityDesignCurrent')}/><Input label="One-way length" suffix="ft" value={vd.lengthFt} onChange={updateVd('lengthFt')}/>
            <label className="field"><span>System</span><div className="select-shell"><select value={vd.phase} onChange={e => updateVd('phase')(e.target.value)}><option value="3ph">3-phase</option><option value="1ph">Single-phase</option></select></div></label>
            <Input label="Nominal voltage" suffix="V" value={vd.nominalVoltage} onChange={updateVd('nominalVoltage')}/>
            <Input label="Power factor" value={vd.powerFactor} onChange={updateVd('powerFactor')}/><Input label="Target voltage drop" suffix="%" value={vd.targetPctVd} onChange={updateVd('targetPctVd')}/>
            <label className="field"><span>Raceway</span><div className="select-shell"><select value={vd.conduitMagnetic} onChange={e => updateVd('conduitMagnetic')(e.target.value)}><option value="false">PVC / non-magnetic</option><option value="true">Steel / magnetic</option></select></div></label>
            <Input label="Operating temp." suffix="°C" value={vd.conductorOperatingTempC} onChange={updateVd('conductorOperatingTempC')}/>
            <Input label="Parallel conductor sets" suffix="sets" value={vd.parallelSets} onChange={updateVd('parallelSets')}/><div className="field"><span>Table availability</span><div className="input-shell"><input readOnly value="Cu · verified Table 9 subset" aria-label="Table availability" /></div></div>
          </div> : <div className="form-grid">
            <label className="field"><span>Conductor size</span><div className="select-shell"><select value={fill.size} onChange={e => setFill({...fill, size: e.target.value})}>{['14','12','10','8','6','4','3','2','1','1/0','2/0','3/0','4/0','250','300','350','400','500'].map(s => <option key={s} value={s}>{s}</option>)}</select></div></label>
            <Input label="Conductor count" value={fill.count} onChange={v => setFill({...fill, count: v})}/>
            <label className="field"><span>Raceway type</span><div className="select-shell"><select><option>EMT</option></select></div></label>
            <label className="field"><span>Trade size</span><div className="select-shell"><select value={fill.tradeSize} onChange={e => setFill({...fill, tradeSize: e.target.value})}>{['1/2','3/4','1','1-1/4','1-1/2','2','2-1/2','3'].map(s => <option key={s}>{s} in.</option>)}</select></div></label>
            <label className="check-field"><input type="checkbox" checked={fill.isNipple} onChange={e => setFill({...fill, isNipple: e.target.checked})}/><span><b>24 in. nipple exception</b><small>Uses the 60% fill allowance.</small></span></label>
          </div>}
          <div className="form-footer"><span>{notice || 'Results update instantly as you change inputs.'}</span><span>Local calculation</span></div>
        </section>
        <aside className="result-card">
          <div className="result-top"><div><p className="eyebrow">LIVE RESULT</p><h2>{tool === 'voltage' ? 'Voltage drop' : 'Conduit fill'}</h2></div><span className={`status ${isError || (fillResult && !fillResult.fits) ? 'danger' : 'pass'}`}>{isError || (fillResult && !fillResult.fits) ? 'Review' : 'Within target'}</span></div>
          {isError ? <div className="error-state"><AlertTriangle size={23}/><b>Calculation needs attention</b><p>{result.error}</p></div> : vdResult ? <><div className="main-metric"><strong>{vdResult.pctVdExact.toFixed(2)}<small>%</small></strong><span>exact voltage drop</span></div><div className="meter"><i style={{width: `${Math.min(100, vdResult.pctVdExact / 5 * 100)}%`}}/></div><div className="metric-scale"><span>0%</span><span>3% target</span><span>5%</span></div><div className="result-rows"><div><span>Voltage loss</span><b>{vdResult.vdExact.toFixed(2)} V</b></div><div><span>Approx. method</span><b>{vdResult.pctVdApprox.toFixed(2)}%</b></div><div><span>Resistance, adjusted</span><b>{vdResult.rAdjustedOhmPerKft.toFixed(3)} Ω/kft</b></div></div></> : fillResult ? <><div className="main-metric"><strong>{fillResult.fillPct.toFixed(1)}<small>%</small></strong><span>raceway fill</span></div><div className="meter"><i style={{width: `${Math.min(100, fillResult.fillPct)}%`}}/></div><div className="metric-scale"><span>0%</span><span>{(fillResult.fillLimitPct * 100).toFixed(0)}% limit</span><span>100%</span></div><div className="result-rows"><div><span>Conductor area</span><b>{fillResult.totalConductorArea.toFixed(4)} in²</b></div><div><span>Allowed area</span><b>{fillResult.allowedArea.toFixed(4)} in²</b></div><div><span>Conduit area</span><b>{fillResult.conduitInteriorArea100pct.toFixed(3)} in²</b></div></div></> : null}
          <button className="audit-link" onClick={() => setShowAudit(true)}><ClipboardCheck size={17}/> View calculation trail <ArrowUpRight size={15}/></button>
        </aside>
      </div>
    </main>
    {showAudit && !isError && <AuditModal result={result as CalcResult<unknown>} onClose={() => setShowAudit(false)} />}
    {showProjects && <ProjectModal projects={projects} activeProjectId={activeProjectId} newProjectName={newProjectName} onNameChange={setNewProjectName} onClose={() => setShowProjects(false)} onCreate={() => void createProject()} onSelect={(id) => { setActiveProjectId(id); setShowProjects(false); setNotice('Active project changed.'); }} />}
  </div>;
}

function ProjectModal({ projects, activeProjectId, newProjectName, onNameChange, onClose, onCreate, onSelect }: { projects: Project[]; activeProjectId?: number; newProjectName: string; onNameChange: (name: string) => void; onClose: () => void; onCreate: () => void; onSelect: (id: number) => void }) {
  const visibleProjects = projects.filter((project, index) => projects.findIndex(candidate => candidate.name === project.name) === index);
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="project-modal" onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">LOCAL PROJECTS</p><h2>Choose a project</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><div className="project-list">{visibleProjects.map(project => <button key={project.id} className={project.id === activeProjectId ? 'project-row selected-project' : 'project-row'} onClick={() => project.id !== undefined && onSelect(project.id)}><span><b>{project.name}</b><small>{project.jurisdiction} · {project.codeEdition}</small></span>{project.id === activeProjectId && <span className="status pass">Active</span>}</button>)}</div><div className="new-project"><label className="field"><span>New project name</span><div className="input-shell"><input value={newProjectName} placeholder="e.g., Midtown tenant fit-out" onChange={event => onNameChange(event.target.value)} onKeyDown={event => event.key === 'Enter' && onCreate()} /></div></label><button className="calculate" onClick={onCreate}><Plus size={17}/> Create</button></div><p className="project-footnote">Saved locally in this browser. Cloud sync is not required.</p></section></div>;
}

function AuditModal({ result, onClose }: { result: CalcResult<unknown>; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="audit-modal" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Calculation evidence</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><div className="audit-meta"><span>Engine {result.engineVersion}</span><span>NEC 2023 references</span><span>Local calculation</span></div><ol className="trace-list">{result.trace.map((step, i) => <li key={i}><span>{i + 1}</span><div><b>{step.step}</b>{step.substitution && <code>{step.substitution}</code>}<p>{step.resultValue} {step.resultUnit}</p></div></li>)}</ol>{result.warnings.length > 0 && <div className="warnings">{result.warnings.map((w, i) => <p key={i}><AlertTriangle size={16}/>{w.message}</p>)}</div>}<button className="calculate wide" onClick={onClose}>Done</button></section></div>;
}

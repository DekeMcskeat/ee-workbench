/**
 * Field verification view — a read-heavy, mobile-width-friendly page for
 * someone standing at a panel or feeder to record what they actually
 * measured and see it compared against the office design calculation.
 * Never edits OneLineNode.data/.result: design inputs are read-only here,
 * and a recorded measurement is a new, separate FieldCheck row (§ commissioning
 * log, not a mutable field) — see src/core/domain/fieldCheck.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, ClipboardCheck, Copy, Trash2 } from 'lucide-react';
import type { CalcResult } from '../../src/core/domain/trace';
import { NODE_TYPE_LABEL, type OneLineNode } from '../../src/core/domain/node';
import type { FieldCheck } from '../../src/core/domain/fieldCheck';
import { listFieldChecksForNode, createFieldCheck, deleteFieldCheck } from '../../src/core/persistence/fieldCheckStore';
import type { Project } from '../../src/core/persistence/projectStore';
import { NODE_TOOLS, firstInvalidNumericField, type SubTool } from './nodeTools';
import { presentError, fmt, hasNonFiniteNumber, InputValidationError, type PresentedError } from './errorPresentation';
import { Input, ErrorState, WARNING_STYLE, AuditModal } from './uiKit';
import { shortNodeRef, fieldViewLink } from './nodeRef';

interface FieldViewProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  nodes: OneLineNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

function fieldCheckableSubTool(node: OneLineNode | null): SubTool | null {
  if (!node) return null;
  return NODE_TOOLS[node.type]?.find(t => t.fieldCheck) ?? null;
}

/** Depth-first flatten of only the field-checkable nodes, in tree order, each tagged with its nearest field-checkable/root ancestor label for context. */
function flattenFieldCheckable(nodes: OneLineNode[]): { node: OneLineNode; parentLabel: string | null }[] {
  const byParent = new Map<string | null, OneLineNode[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);

  const out: { node: OneLineNode; parentLabel: string | null }[] = [];
  function walk(parentId: string | null, ancestorLabel: string | null) {
    for (const n of byParent.get(parentId) ?? []) {
      const isFieldCheckable = !!fieldCheckableSubTool(n);
      if (isFieldCheckable) out.push({ node: n, parentLabel: ancestorLabel });
      walk(n.id, isFieldCheckable ? n.name : ancestorLabel);
    }
  }
  walk(null, null);
  return out;
}

export function FieldView({ projects, activeProjectId, onSelectProject, nodes, selectedNodeId, onSelectNode }: FieldViewProps) {
  const [fieldChecks, setFieldChecks] = useState<FieldCheck[]>([]);
  const [measuredDraft, setMeasuredDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState('');
  const [showAudit, setShowAudit] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'unavailable'>('idle');

  const rows = useMemo(() => flattenFieldCheckable(nodes), [nodes]);
  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null;
  const parentNode = selectedNode ? nodes.find(n => n.id === selectedNode.parentId) ?? null : null;
  const childNodes = selectedNode ? nodes.filter(n => n.parentId === selectedNode.id) : [];
  const subTool = fieldCheckableSubTool(selectedNode);

  const availableTools = selectedNode ? NODE_TOOLS[selectedNode.type] : [];
  const isNamespaced = availableTools.length > 1;
  const subData: Record<string, any> = !selectedNode || !subTool ? {}
    : isNamespaced ? { ...subTool.defaultData, ...((selectedNode.data as any)?.[subTool.id] ?? {}) }
    : { ...subTool.defaultData, ...(selectedNode.data as any) };

  useEffect(() => {
    setMeasuredDraft({});
    setNoteDraft('');
    setCopyState('idle');
    if (!selectedNodeId) { setFieldChecks([]); return; }
    let cancelled = false;
    (async () => {
      const rows = await listFieldChecksForNode(selectedNodeId);
      if (!cancelled) setFieldChecks(rows);
    })();
    return () => { cancelled = true; };
  }, [selectedNodeId]);

  // Design result is recomputed live from stored inputs (same pattern the
  // One-line view uses) rather than trusted from node.result, which is a
  // single cache slot shared by every sub-tool on the node and may hold a
  // different sub-tool's last-viewed shape.
  const designResult: CalcResult<any> | { error: PresentedError } | null = useMemo(() => {
    if (!selectedNode || !subTool) return null;
    try {
      const missing = firstInvalidNumericField(subTool.fields, subData);
      if (missing) throw new InputValidationError(`The design calc for this node is missing "${missing}" — open it in the One-line editor to complete it.`);
      const out = subTool.run(subData, { node: selectedNode, parent: parentNode, children: childNodes });
      if (hasNonFiniteNumber(out.result)) throw new InputValidationError('The design calc for this node currently produces an undefined result — open it in the One-line editor to fix it.');
      return out;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    } catch (error) {
      return { error: presentError(error) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, subTool?.id, JSON.stringify(subData), JSON.stringify(childNodes.map(c => ({ id: c.id, data: c.data })))]);

  const relevantChecks = subTool ? fieldChecks.filter(c => c.subToolId === subTool.id) : [];
  const latestCheck = relevantChecks[0] ?? null;

  const varianceResult: CalcResult<any> | { error: PresentedError } | null = useMemo(() => {
    if (!subTool?.fieldCheck || !designResult || 'error' in designResult) return null;
    try {
      return subTool.fieldCheck.computeVariance(designResult, latestCheck, subData);
    } catch (error) {
      return { error: presentError(error) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTool?.id, designResult, latestCheck?.id, JSON.stringify(subData)]);

  function varianceForRow(check: FieldCheck): CalcResult<any> | { error: PresentedError } | null {
    if (!subTool?.fieldCheck || !designResult || 'error' in designResult) return null;
    try { return subTool.fieldCheck.computeVariance(designResult, check, subData); } catch (error) { return { error: presentError(error) }; }
  }

  const visibleMeasureFields = subTool?.fieldCheck?.fields.filter(f => !f.showIf || f.showIf(subData)) ?? [];
  const canSubmit = visibleMeasureFields.length > 0 && visibleMeasureFields.every(f => {
    const raw = measuredDraft[f.key];
    return raw !== undefined && raw !== '' && Number.isFinite(+raw);
  });

  const submitMeasurement = async () => {
    if (!selectedNode || !subTool?.fieldCheck || !activeProjectId || !canSubmit) return;
    const measured: Record<string, number> = {};
    for (const f of visibleMeasureFields) measured[f.key] = +measuredDraft[f.key];
    await createFieldCheck(activeProjectId, selectedNode.id, subTool.id, measured, noteDraft);
    setFieldChecks(await listFieldChecksForNode(selectedNode.id));
    setMeasuredDraft({});
    setNoteDraft('');
  };

  const removeCheck = async (id: string) => {
    await deleteFieldCheck(id);
    if (selectedNode) setFieldChecks(await listFieldChecksForNode(selectedNode.id));
  };

  const copyLink = async () => {
    if (!selectedNode) return;
    const link = fieldViewLink(selectedNode.id);
    try {
      await navigator.clipboard.writeText(link);
      setCopyState('copied');
    } catch {
      setCopyState('unavailable');
    }
    window.setTimeout(() => setCopyState('idle'), 2000);
  };

  return <div className="field-view">
    <div className="field-project-bar">
      <label>
        <span>Project</span>
        <select value={activeProjectId ?? ''} onChange={e => onSelectProject(e.target.value)}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <small>{rows.length} field-checkable node{rows.length === 1 ? '' : 's'} (panels & feeders) in this project</small>
    </div>

    <div className="field-layout">
      <section className="field-node-list">
        {rows.length === 0 && <div className="empty-state"><ClipboardCheck size={26}/><p>No panels or feeders in this project yet — add them in the One-line editor.</p></div>}
        <ul>
          {rows.map(({ node, parentLabel }) => (
            <li key={node.id}>
              <button className={node.id === selectedNodeId ? 'selected' : ''} onClick={() => onSelectNode(node.id)}>
                <span className="field-node-row-main">
                  <b>{node.name}</b>
                  <small>{NODE_TYPE_LABEL[node.type]}{parentLabel ? ` · under ${parentLabel}` : ''}</small>
                </span>
                <ChevronRight size={15}/>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="field-detail-card">
        {!selectedNode || !subTool ? (
          <div className="empty-state"><ClipboardCheck size={26}/><p>Select a panel or feeder to record a field measurement.</p></div>
        ) : <>
          <div className="field-detail-head">
            <div>
              <p className="eyebrow">{NODE_TYPE_LABEL[selectedNode.type].toUpperCase()}</p>
              <h2>{selectedNode.name}</h2>
              {parentNode && <p className="field-detail-parent">Parent: <b>{parentNode.name}</b></p>}
            </div>
            <div className="field-ref-block">
              <span>Field ref</span>
              <code>{shortNodeRef(selectedNode.id)}</code>
              <button type="button" onClick={copyLink}>
                {copyState === 'copied' ? <Check size={13}/> : <Copy size={13}/>}
                {copyState === 'copied' ? 'Copied' : copyState === 'unavailable' ? 'Copy unavailable' : 'Copy link'}
              </button>
            </div>
          </div>

          <div className="field-section">
            <p className="field-section-label">Design result (office calculation, read-only)</p>
            {designResult && 'error' in designResult
              ? <ErrorState error={designResult.error} />
              : designResult && <div className="field-design-summary">
                  <div className="field-design-metric"><strong>{subTool.metric(designResult.result).value}<small>{subTool.metric(designResult.result).unit}</small></strong><span>{subTool.metric(designResult.result).label}</span></div>
                  <div className="result-rows">{subTool.rows(designResult.result).map((row, i) => <div key={i}><span>{row.label}</span><b>{row.value}</b></div>)}</div>
                </div>}
          </div>

          <div className="field-section">
            <p className="field-section-label">Record a measurement</p>
            <div className="form-grid field-measure-grid">
              {visibleMeasureFields.map(f => (
                <Input key={f.key} label={f.label} suffix={f.suffix} value={measuredDraft[f.key] ?? ''} onChange={v => setMeasuredDraft(d => ({ ...d, [f.key]: v }))}/>
              ))}
              <label className="field field-note-input">
                <span>Note (optional)</span>
                <div className="input-shell"><input type="text" value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="e.g. measured at MDP-1 load side, clear sky, 82°F"/></div>
              </label>
            </div>
            <button type="button" className="calculate" disabled={!canSubmit} onClick={submitMeasurement}>Record measurement</button>
          </div>

          <div className="field-section">
            <p className="field-section-label">Variance vs. design</p>
            {varianceResult === null ? <p className="field-empty-note">Fix the design calc above before a variance can be shown.</p>
              : 'error' in varianceResult ? <ErrorState error={varianceResult.error} />
              : <div className="field-variance-block">
                  <div className="field-variance-metric">
                    <strong>{fmt(varianceResult.result.percentVariance, 1)}<small>%</small></strong>
                    <span>variance from design ({fmt(varianceResult.result.designValue)} designed vs. {fmt(varianceResult.result.measuredValue)} measured)</span>
                  </div>
                  {varianceResult.warnings.map((w, i) => {
                    const style = WARNING_STYLE[w.level];
                    return <div key={i} className={`callout ${style.className}`}><span className="callout-heading">{style.heading}</span><p><style.icon size={15}/>{w.message}</p></div>;
                  })}
                  {varianceResult.warnings.length === 0 && <div className="callout callout-info"><span className="callout-heading">Within guideline</span><p>Measured value is within the {'±10'}% guideline of the design calculation.</p></div>}
                  <button className="audit-link" onClick={() => setShowAudit(true)}><ClipboardCheck size={17}/> View calculation trail</button>
                </div>}
          </div>

          <div className="field-section">
            <p className="field-section-label">Measurement history</p>
            {relevantChecks.length === 0 ? <p className="field-empty-note">No measurements recorded yet for this node.</p> : (
              <ul className="field-history">
                {relevantChecks.map(check => {
                  const v = varianceForRow(check);
                  const level = v && !('error' in v) ? v.warnings[0]?.level : undefined;
                  return <li key={check.id} className="field-history-row">
                    <div>
                      <b>{new Date(check.timestamp).toLocaleString()}</b>
                      {level && <span className={`field-history-flag field-history-flag-${level}`}>{level}</span>}
                      <small>{visibleMeasureFields.map(f => `${f.label}: ${check.measured[f.key] ?? '—'}${f.suffix ?? ''}`).join(' · ')}</small>
                      {check.note && <small className="field-history-note">“{check.note}”</small>}
                    </div>
                    <button type="button" className="row-icon danger" aria-label="Delete measurement" onClick={() => removeCheck(check.id)}><Trash2 size={14}/></button>
                  </li>;
                })}
              </ul>
            )}
          </div>
        </>}
      </section>
    </div>

    {showAudit && varianceResult && !('error' in varianceResult) && <AuditModal result={varianceResult} onClose={() => setShowAudit(false)} />}
  </div>;
}

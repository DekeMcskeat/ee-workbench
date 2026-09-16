/**
 * Small presentational pieces shared by App.tsx (Workbench/One-line) and
 * FieldView.tsx (Field verification) — pulled out of App.tsx so the two
 * views can both use them without a circular import between the two files.
 */
import { AlertTriangle, Info, OctagonAlert, Sparkles, X } from 'lucide-react';
import type { CalcResult, CalcWarning, Assumption, CodeReference } from '../../src/core/domain/trace';
import type { PresentedError } from './errorPresentation';

/** Same "STANDARD EDITION TABLE/SECTION" shape as report/pdf.ts's formatCodeRef and report/csv.ts's inline equivalent, so a code reference reads identically on-screen and in an export. */
function formatCodeRef(r: CodeReference): string {
  return [r.standard, r.edition, r.table, r.section].filter(Boolean).join(' ');
}

export const Input = ({ label, suffix, value, onChange, type = 'number' }: { label: string; suffix?: string; value: string | number; onChange: (v: string) => void; type?: string }) => (
  <label className="field"><span>{label}</span><div className="input-shell"><input type={type} value={value} onChange={e => onChange(e.target.value)} />{suffix && <em>{suffix}</em>}</div></label>
);

export const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
  <label className="field"><span>{label}</span><div className="select-shell"><select value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div></label>
);

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const ERROR_KIND_STYLE: Record<PresentedError['kind'], { icon: typeof AlertTriangle; note: string }> = {
  input: { icon: Info, note: 'Fix the field above and this will calculate automatically.' },
  coverage: { icon: OctagonAlert, note: "This isn't something you did wrong — this build hasn't verified that table entry yet." },
  domain: { icon: AlertTriangle, note: 'The inputs are individually valid but this combination trips a rule this tool enforces.' },
  unverified: { icon: Info, note: 'Record a field measurement below to compare it against the design calculation.' },
  unknown: { icon: AlertTriangle, note: '' },
};

export function ErrorState({ error }: { error: PresentedError }) {
  const style = ERROR_KIND_STYLE[error.kind];
  return <div className={`error-state error-state-${error.kind}`}>
    <style.icon size={23}/>
    <b>{error.heading}</b>
    <p>{error.detail}</p>
    {style.note && <small>{style.note}</small>}
  </div>;
}

export const WARNING_STYLE: Record<CalcWarning['level'], { className: string; icon: typeof AlertTriangle; heading: string }> = {
  violation: { className: 'callout-violation', icon: OctagonAlert, heading: 'Violation' },
  warning: { className: 'callout-warning', icon: AlertTriangle, heading: 'Warning' },
  info: { className: 'callout-info', icon: Info, heading: 'Info' },
};

export function AuditModal({ result, onClose }: { result: CalcResult<unknown>; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="audit-modal" onMouseDown={e => e.stopPropagation()}>
    <div className="modal-head"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Calculation evidence</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={19}/></button></div>
    <div className="audit-meta"><span>Engine {result.engineVersion}</span><span>NEC 2023 references</span><span>Local calculation</span></div>
    <ol className="trace-list">{result.trace.map((step, i) => <li key={i}><span>{i + 1}</span><div>
      <b>{step.step}</b>
      {step.formulaLatex && <code className="trace-formula">{step.formulaLatex}</code>}
      {step.substitution && <code>{step.substitution}</code>}
      <p>{step.resultValue} {step.resultUnit}</p>
      {step.codeRefs && step.codeRefs.length > 0 && <div className="code-ref-pills">
        {step.codeRefs.map((r, j) => <span key={j} className="code-ref-pill" title={r.note}>{formatCodeRef(r)}</span>)}
      </div>}
    </div></li>)}</ol>
    {(['violation', 'warning', 'info'] as const).map(level => {
      const items = result.warnings.filter(w => w.level === level);
      if (items.length === 0) return null;
      const style = WARNING_STYLE[level];
      return <div key={level} className={`callout ${style.className}`}><span className="callout-heading">{style.heading}</span>
        {items.map((w, i) => <p key={i}><style.icon size={15}/>{w.message}</p>)}
      </div>;
    })}
    {result.assumptions.length > 0 && <div className="callout callout-assumption"><span className="callout-heading">Assumptions logged</span>
      {(result.assumptions as Assumption[]).map((a, i) => <p key={i}><Sparkles size={15}/>{a.text}</p>)}
    </div>}
    <button className="calculate wide" onClick={onClose}>Done</button>
  </section></div>;
}

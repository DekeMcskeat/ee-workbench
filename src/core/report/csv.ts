import Papa from 'papaparse';
import type { PanelCircuit, PanelBalanceResult } from '../calc/panelBalance';
import type { FieldCheckHistoryRow } from '../calc/fieldVariance';
import type { CalcResult } from '../domain/trace';

export function panelScheduleCsv(circuits: PanelCircuit[], balance: PanelBalanceResult, branding?: ReportBranding): string {
  const rows: Record<string, string | number>[] = circuits.map((c, i) => ({
    'Ckt #': i + 1,
    Description: c.name,
    'VA': c.va,
    'Phase tap': c.tap,
    'Breaker (A)': c.breakerA ?? '',
  }));
  rows.push({ 'Ckt #': '', Description: 'TOTALS', VA: balance.totalVa, 'Phase tap': `A=${balance.phaseVa.A.toFixed(0)} B=${balance.phaseVa.B.toFixed(0)} C=${balance.phaseVa.C.toFixed(0)}`, 'Breaker (A)': '' });
  rows.push({ 'Ckt #': '', Description: 'Imbalance', VA: '', 'Phase tap': `${balance.imbalancePct.toFixed(1)}%`, 'Breaker (A)': '' });
  return `${csvBrandingHeaderLine(branding)}\n${Papa.unparse(rows)}`;
}

/** One "section" of an export — appended below the primary CSV table, not shipped as a separate file/report type. */
export function fieldCheckHistoryCsv(rows: FieldCheckHistoryRow[]): string {
  const table = rows.map(r => ({
    Date: new Date(r.timestamp).toLocaleString(),
    'Design value': r.designValue,
    'Measured value': r.measuredValue,
    'Absolute variance': r.absoluteVariance,
    'Variance %': Number.isFinite(r.percentVariance) ? r.percentVariance.toFixed(1) : 'undefined (design=0)',
    Flag: r.warningLevel ?? '',
    Note: r.note ?? '',
  }));
  return `FIELD VERIFICATION HISTORY\n${Papa.unparse(table)}`;
}

/**
 * Project-level report branding (firm/company name, a license or contact
 * line) applied to every export's header in place of the hardcoded "EE
 * Workbench" strings. Defined here (not imported from
 * `persistence/projectStore`'s `Project` type) so the report layer doesn't
 * take a dependency on the persistence layer — App.tsx maps a project's
 * stored `branding` into this shape when calling an export function.
 */
export interface ReportBranding {
  firmName?: string;
  licenseOrContact?: string;
}

/** "FIRM NAME" if set, else the default app name — the PDF header/CSV header-line brand string. */
export function brandName(branding: ReportBranding | undefined): string {
  return branding?.firmName?.trim() || 'EE Workbench';
}

/** A one-line CSV header row — brand name, plus the license/contact line if set — prepended above the data table. */
export function csvBrandingHeaderLine(branding: ReportBranding | undefined): string {
  const contact = branding?.licenseOrContact?.trim();
  return contact ? `${brandName(branding)} · ${contact}` : brandName(branding);
}

/** One row of the project-wide Schedule (bill of materials) rollup — see App.tsx's Schedule view and ui/src/nodeTools.ts's `bomRowsForNode`. */
export interface BomEntry {
  nodeName: string;
  nodeType: string;
  spec: { label: string; value: string }[];
}

export function bomCsv(entries: BomEntry[], branding?: ReportBranding): string {
  const rows = entries.map(e => ({
    Node: e.nodeName,
    Type: e.nodeType,
    Spec: e.spec.map(s => `${s.label}: ${s.value}`).join('; '),
  }));
  return `${csvBrandingHeaderLine(branding)}\n${Papa.unparse(rows)}`;
}

export function calcTraceCsv(result: CalcResult<unknown>, branding?: ReportBranding): string {
  const rows = result.trace.map((s, i) => ({
    'Step #': i + 1,
    Step: s.step,
    Formula: s.formulaLatex ?? '',
    Substitution: s.substitution ?? '',
    Result: s.resultValue,
    Unit: s.resultUnit ?? '',
    'Code refs': (s.codeRefs ?? []).map(r => [r.standard, r.edition, r.table, r.section].filter(Boolean).join(' ')).join('; '),
  }));
  return `${csvBrandingHeaderLine(branding)}\n${Papa.unparse(rows)}`;
}

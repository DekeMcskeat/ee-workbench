/**
 * PDF calc-package generator (spec Phase 4 / §11 Reports).
 *
 * Tradeoff note (tech stack decision): pdf-lib over React-PDF. This report
 * is a flat, structural document (trace steps, warnings, assumptions, a
 * signature block) with no need for React's component/reconciliation model
 * or a separate renderer process — pdf-lib draws directly onto a PDFPage
 * with predictable, easily-testable layout math, runs identically in the
 * browser and in Node (useful if report generation ever moves to a worker
 * or a server job), and has a much smaller bundle footprint.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { CalcWarning, Assumption, CodeReference, TraceStep } from '../domain/trace';
import type { FieldCheckHistoryRow } from '../calc/fieldVariance';
import type { PanelCircuit, PanelBalanceResult } from '../calc/panelBalance';

export interface CalcPackageParams {
  projectName: string;
  nodeName: string;
  calcLabel: string;
  engineVersion: string;
  generatedAt: Date;
  trace: TraceStep[];
  warnings: CalcWarning[];
  assumptions: Assumption[];
  /** Optional — appended as an additional section, not a separate report, when this node has recorded field-verification measurements. */
  fieldCheckHistory?: FieldCheckHistoryRow[];
}

function fmtVariancePct(n: number): string {
  return Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` : 'undefined (design=0)';
}

const MARGIN = 50;
const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const INK = rgb(0.09, 0.15, 0.24);
const MUTED = rgb(0.42, 0.47, 0.54);
const FAINT = rgb(0.82, 0.85, 0.89);

function formatCodeRef(r: CodeReference): string {
  return [r.standard, r.edition, r.table, r.section].filter(Boolean).join(' ');
}

class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.newPage();
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  private ensureSpace(h: number) {
    if (this.y - h < MARGIN) this.newPage();
  }

  text(str: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const color = opts.color ?? INK;
    const gap = opts.gap ?? size + 4;
    const maxWidth = PAGE_W - 2 * MARGIN;

    const words = str.split(' ');
    let line = '';
    const lines: string[] = [];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      this.ensureSpace(gap);
      this.page.drawText(l, { x: MARGIN, y: this.y, size, font, color });
      this.y -= gap;
    }
  }

  space(h = 10) {
    this.y -= h;
  }

  rule() {
    this.ensureSpace(14);
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y }, thickness: 0.75, color: FAINT });
    this.y -= 14;
  }

  /** A single-line, fixed-column row — for compact tabular sections (e.g. a panel directory) where full word-wrap isn't needed. */
  row(cols: { text: string; width: number; bold?: boolean }[], opts: { size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const size = opts.size ?? 9.5;
    const color = opts.color ?? INK;
    this.ensureSpace(size + 6);
    let x = MARGIN;
    for (const col of cols) {
      this.page.drawText(col.text, { x, y: this.y, size, font: col.bold ? this.bold : this.font, color });
      x += col.width;
    }
    this.y -= size + 6;
  }
}

export async function generateCalcPackagePdf(p: CalcPackageParams): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${p.projectName} — ${p.nodeName} — ${p.calcLabel}`);
  doc.setProducer('EE Workbench');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new PdfWriter(doc, font, bold);

  w.text('EE WORKBENCH — CALCULATION PACKAGE', { size: 16, bold: true, gap: 24 });
  w.text(`${p.projectName}  ·  ${p.nodeName}  ·  ${p.calcLabel}`, { size: 11, gap: 16 });
  w.text(`Generated ${p.generatedAt.toLocaleString()}   ·   Engine v${p.engineVersion}   ·   NEC 2023 references (unverified third-party transcription — confirm against your adopted code book)`, { size: 8.5, color: MUTED, gap: 18 });
  w.rule();

  w.text('CALCULATION TRACE', { size: 12, bold: true, gap: 18 });
  p.trace.forEach((step, i) => {
    w.text(`${i + 1}. ${step.step}`, { size: 10, bold: true, gap: 13 });
    if (step.formulaLatex) w.text(`Formula: ${step.formulaLatex}`, { size: 8.5, color: MUTED, gap: 11 });
    if (step.substitution) w.text(`Substitution: ${step.substitution}`, { size: 8.5, color: MUTED, gap: 11 });
    w.text(`Result: ${step.resultValue}${step.resultUnit ? ' ' + step.resultUnit : ''}`, { size: 9.5, gap: 11 });
    if (step.codeRefs && step.codeRefs.length) {
      w.text(`Code refs: ${step.codeRefs.map(formatCodeRef).join('; ')}`, { size: 8, color: MUTED, gap: 15 });
    } else {
      w.space(5);
    }
  });

  if (p.warnings.length > 0) {
    w.rule();
    w.text('WARNINGS', { size: 12, bold: true, gap: 18 });
    for (const warn of p.warnings) {
      w.text(`[${warn.level.toUpperCase()}] ${warn.message}`, { size: 9, gap: 13 });
    }
  }

  if (p.assumptions.length > 0) {
    w.rule();
    w.text('ASSUMPTIONS', { size: 12, bold: true, gap: 18 });
    for (const a of p.assumptions) {
      w.text(`- (${a.kind}) ${a.text}`, { size: 9, gap: 13 });
    }
  }

  if (p.fieldCheckHistory && p.fieldCheckHistory.length > 0) {
    w.rule();
    w.text('FIELD VERIFICATION HISTORY', { size: 12, bold: true, gap: 18 });
    w.text('Commissioning/as-built measurements recorded from the Field view, compared against this design calculation. Design data itself is never overwritten by a field measurement.', { size: 8.5, color: MUTED, gap: 14 });
    for (const row of p.fieldCheckHistory) {
      const levelTag = row.warningLevel ? `[${row.warningLevel.toUpperCase()}] ` : '';
      w.text(`${levelTag}${new Date(row.timestamp).toLocaleString()} — design ${row.designValue.toFixed(2)}, measured ${row.measuredValue.toFixed(2)}, variance ${fmtVariancePct(row.percentVariance)}`, { size: 9, bold: true, gap: 12 });
      if (row.note) w.text(`Note: ${row.note}`, { size: 8.5, color: MUTED, gap: 13 });
      else w.space(4);
    }
  }

  w.rule();
  w.text('DISCLAIMER', { size: 11, bold: true, gap: 16 });
  w.text('This calculation is a design aid. It does not constitute a professional engineering opinion. Verify all results against the adopted local code and have them reviewed by a licensed PE.', { size: 8.5, color: MUTED, gap: 12 });
  w.space(22);
  w.text('Prepared by: _______________________________          Date: ____________', { size: 10, gap: 18 });
  w.text('Reviewed by (PE): __________________________          License #: ____________          Date: ____________', { size: 10, gap: 16 });

  return doc.save();
}

export interface PanelDirectoryParams {
  projectName: string;
  panelName: string;
  /** Nameplate data entered directly on the Phase Balance tool — not derived, since this app doesn't infer as-installed equipment ratings from a load calculation. */
  voltage?: number;
  phaseConfig: '1ph_3w' | '3ph_4w';
  mainRatingA?: number;
  generatedAt: Date;
  circuits: PanelCircuit[];
  balance: PanelBalanceResult;
}

const PHASE_CONFIG_LABEL: Record<'1ph_3w' | '3ph_4w', string> = {
  '1ph_3w': 'Single-phase, 3-wire (A/B)',
  '3ph_4w': '3-phase, 4-wire (A/B/C)',
};

/**
 * A compact, print-ready panel directory/nameplate — the kind taped inside
 * a panel door — as its own export, separate from `generateCalcPackagePdf`'s
 * full trace/warnings/assumptions calc package.
 */
export async function generatePanelDirectoryPdf(p: PanelDirectoryParams): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${p.projectName} — ${p.panelName} — Panel Directory`);
  doc.setProducer('EE Workbench');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new PdfWriter(doc, font, bold);

  w.text('EE WORKBENCH — PANEL DIRECTORY', { size: 16, bold: true, gap: 24 });
  w.text(`${p.projectName}  ·  ${p.panelName}`, { size: 11, gap: 16 });
  w.text(`Generated ${p.generatedAt.toLocaleString()}`, { size: 8.5, color: MUTED, gap: 18 });
  w.rule();

  w.text('NAMEPLATE', { size: 12, bold: true, gap: 16 });
  w.text(`Panel: ${p.panelName}`, { size: 10, gap: 13 });
  w.text(`Project: ${p.projectName}`, { size: 10, gap: 13 });
  w.text(`Voltage: ${p.voltage ? `${p.voltage} V` : 'not entered'}`, { size: 10, gap: 13 });
  w.text(`Configuration: ${PHASE_CONFIG_LABEL[p.phaseConfig]}`, { size: 10, gap: 13 });
  w.text(`Main rating: ${p.mainRatingA ? `${p.mainRatingA} A` : 'not entered'}`, { size: 10, gap: 18 });
  w.rule();

  w.text('CIRCUIT DIRECTORY', { size: 12, bold: true, gap: 16 });
  w.row([
    { text: 'Ckt', width: 40, bold: true },
    { text: 'Description', width: 230, bold: true },
    { text: 'Tap', width: 60, bold: true },
    { text: 'VA', width: 80, bold: true },
    { text: 'Breaker', width: 80, bold: true },
  ], { color: MUTED });
  p.circuits.forEach((c, i) => {
    w.row([
      { text: String(i + 1), width: 40 },
      { text: c.name, width: 230 },
      { text: c.tap, width: 60 },
      { text: c.va.toFixed(0), width: 80 },
      { text: c.breakerA ? `${c.breakerA} A` : '—', width: 80 },
    ]);
  });
  w.space(6);
  w.rule();

  w.text('PHASE TOTALS', { size: 12, bold: true, gap: 16 });
  w.text(`A = ${p.balance.phaseVa.A.toFixed(0)} VA   B = ${p.balance.phaseVa.B.toFixed(0)} VA${p.phaseConfig === '3ph_4w' ? `   C = ${p.balance.phaseVa.C.toFixed(0)} VA` : ''}`, { size: 10, gap: 14 });
  w.text(`Total connected load: ${p.balance.totalVa.toFixed(0)} VA`, { size: 10, gap: 14 });
  w.text(`Phase imbalance: ${p.balance.imbalancePct.toFixed(1)}%${p.balance.imbalancePct > 20 ? ' (exceeds the 20% engineering guideline — see the calc audit trail)' : ''}`, { size: 10, gap: 18 });

  w.rule();
  w.text('Design-aid summary generated from the office calculation — confirm against the physically installed panel before taping inside the enclosure.', { size: 8, color: MUTED, gap: 12 });

  return doc.save();
}

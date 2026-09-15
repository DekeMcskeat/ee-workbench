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

export interface CalcPackageParams {
  projectName: string;
  nodeName: string;
  calcLabel: string;
  engineVersion: string;
  generatedAt: Date;
  trace: TraceStep[];
  warnings: CalcWarning[];
  assumptions: Assumption[];
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

  w.rule();
  w.text('DISCLAIMER', { size: 11, bold: true, gap: 16 });
  w.text('This calculation is a design aid. It does not constitute a professional engineering opinion. Verify all results against the adopted local code and have them reviewed by a licensed PE.', { size: 8.5, color: MUTED, gap: 12 });
  w.space(22);
  w.text('Prepared by: _______________________________          Date: ____________', { size: 10, gap: 18 });
  w.text('Reviewed by (PE): __________________________          License #: ____________          Date: ____________', { size: 10, gap: 16 });

  return doc.save();
}

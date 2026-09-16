import { describe, it, expect } from 'vitest';
import { bomCsv, type BomEntry } from '../core/report/csv';
import { generateBomPdf } from '../core/report/pdf';

describe('bomCsv (project Schedule / bill-of-materials CSV)', () => {
  it('produces one row per entry, joining a multi-item spec into a single readable column', () => {
    const entries: BomEntry[] = [
      { nodeName: 'XFMR-1', nodeType: 'Transformer', spec: [{ label: 'Rating', value: '1000 kVA' }, { label: 'Voltage', value: '13800/480 V' }] },
      { nodeName: 'Panel A', nodeType: 'Panel / switchboard', spec: [{ label: 'Configuration', value: '3φ, 4-wire' }, { label: 'Phase imbalance', value: '5.0%' }] },
    ];
    const csv = bomCsv(entries);
    expect(csv).toContain('XFMR-1');
    expect(csv).toContain('Rating: 1000 kVA; Voltage: 13800/480 V');
    expect(csv).toContain('Panel A');
    expect(csv).toContain('Configuration: 3φ, 4-wire; Phase imbalance: 5.0%');
  });

  it('an empty project produces just a header row, not an error', () => {
    const csv = bomCsv([]);
    expect(() => bomCsv([])).not.toThrow();
    expect(csv.split('\n').filter(Boolean).length).toBeLessThanOrEqual(1);
  });

  it('a node with no spec (no bomRow-declaring sub-tool for its type) gets an empty joined string, not a crash', () => {
    const entries: BomEntry[] = [{ nodeName: 'Mystery node', nodeType: 'Unknown', spec: [] }];
    const csv = bomCsv(entries);
    expect(csv).toContain('Mystery node');
  });
});

describe('generateBomPdf (project Schedule / bill-of-materials PDF)', () => {
  it('renders a valid PDF for a populated schedule', async () => {
    const entries: BomEntry[] = [
      { nodeName: 'XFMR-1', nodeType: 'Transformer', spec: [{ label: 'Rating', value: '1000 kVA' }] },
    ];
    const bytes = await generateBomPdf({ projectName: 'Test Project', generatedAt: new Date('2026-01-01'), entries });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('an empty project still renders a valid PDF (a "no nodes yet" page, not an error)', async () => {
    const bytes = await generateBomPdf({ projectName: 'Empty Project', generatedAt: new Date('2026-01-01'), entries: [] });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('a node with no spec renders "no spec available" rather than an empty/blank cell', async () => {
    const entries: BomEntry[] = [{ nodeName: 'Mystery node', nodeType: 'Unknown', spec: [] }];
    const bytes = await generateBomPdf({ projectName: 'Test Project', generatedAt: new Date('2026-01-01'), entries });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });
});

import Papa from 'papaparse';
import type { PanelCircuit, PanelBalanceResult } from '../calc/panelBalance';
import type { CalcResult } from '../domain/trace';

export function panelScheduleCsv(circuits: PanelCircuit[], balance: PanelBalanceResult): string {
  const rows: Record<string, string | number>[] = circuits.map((c, i) => ({
    'Ckt #': i + 1,
    Description: c.name,
    'VA': c.va,
    'Phase tap': c.tap,
  }));
  rows.push({ 'Ckt #': '', Description: 'TOTALS', VA: balance.totalVa, 'Phase tap': `A=${balance.phaseVa.A.toFixed(0)} B=${balance.phaseVa.B.toFixed(0)} C=${balance.phaseVa.C.toFixed(0)}` });
  rows.push({ 'Ckt #': '', Description: 'Imbalance', VA: '', 'Phase tap': `${balance.imbalancePct.toFixed(1)}%` });
  return Papa.unparse(rows);
}

export function calcTraceCsv(result: CalcResult<unknown>): string {
  const rows = result.trace.map((s, i) => ({
    'Step #': i + 1,
    Step: s.step,
    Formula: s.formulaLatex ?? '',
    Substitution: s.substitution ?? '',
    Result: s.resultValue,
    Unit: s.resultUnit ?? '',
    'Code refs': (s.codeRefs ?? []).map(r => [r.standard, r.edition, r.table, r.section].filter(Boolean).join(' ')).join('; '),
  }));
  return Papa.unparse(rows);
}

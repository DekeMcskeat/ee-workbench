export interface CodeReference {
  standard: 'NEC' | 'IEC' | 'NFPA70E' | 'IEEE1584' | 'IEEE_SC_PTP' | 'NEMA' | 'CUSTOM';
  edition: string;
  section?: string;
  table?: string;
  note?: string;
}

export type WarningLevel = 'violation' | 'warning' | 'info';

export interface CalcWarning {
  level: WarningLevel;
  message: string;
  codeRef?: CodeReference;
}

export interface TraceStep {
  step: string;
  formulaLatex?: string;
  substitution?: string;
  resultValue: number | string;
  resultUnit?: string;
  codeRefs?: CodeReference[];
}

export interface Assumption {
  kind: 'user_override' | 'engineering_judgment' | 'unverified_table_value' | 'infinite_bus' | 'other';
  text: string;
}

export const ENGINE_VERSION = '0.3.1';

export interface CalcResult<TResult> {
  engineVersion: string;
  trace: TraceStep[];
  result: TResult;
  warnings: CalcWarning[];
  assumptions: Assumption[];
  codeRefs: CodeReference[];
}

export function newTrace(): TraceStep[] {
  return [];
}

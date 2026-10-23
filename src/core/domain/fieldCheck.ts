/**
 * A field-recorded measurement — what a commissioning/field engineer
 * actually measured at a panel or feeder, kept strictly separate from
 * OneLineNode.data/.result. A field check never overwrites design data;
 * it is only ever compared against it (see core/calc/fieldVariance.ts).
 */
export interface FieldCheck {
  id: string;
  projectId: string;
  nodeId: string;
  /** Which of the node's SubTool ids this measurement is comparable to (e.g. 'conductor', 'balance') — see ui/src/nodeTools.ts's `fieldCheck` config. */
  subToolId: string;
  /** ISO 8601 — when the field measurement was taken (not when the row was saved). */
  timestamp: string;
  note?: string;
  /** Measured values, keyed by field name. Shape depends on subToolId — each field-checkable SubTool documents the keys it reads in its `fieldCheck.fields` config. */
  measured: Record<string, number>;
}

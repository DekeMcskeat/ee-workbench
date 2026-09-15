/**
 * One-line hierarchy node. A project is a tree of these: Utility -> Transformer
 * -> Panel -> Feeder -> Motor/Load, etc. Each node type maps to the calc
 * module(s) relevant to it (see ui/src/nodeConfig.ts for the type->calc wiring).
 *
 * `data` holds the last-entered form inputs for whichever calc module(s) this
 * node type uses (untyped here deliberately — each calc module already
 * defines and validates its own input shape; this is just the persisted
 * form state). `result` caches the last computed CalcResult-shaped output so
 * the tree/schedule views can show a live number without recomputing every
 * node on every render.
 */
export type NodeType = 'utility' | 'transformer' | 'panel' | 'feeder' | 'motor' | 'load';

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  utility: 'Utility source',
  transformer: 'Transformer',
  panel: 'Panel / switchboard',
  feeder: 'Feeder / branch conductor',
  motor: 'Motor',
  load: 'Load (branch circuit)',
};

/** Which node types are allowed as children of a given parent type. Root nodes (parentId=null) must be 'utility'. */
export const ALLOWED_CHILDREN: Record<NodeType, NodeType[]> = {
  utility: ['transformer', 'feeder'],
  transformer: ['panel', 'feeder'],
  panel: ['feeder', 'load', 'motor'],
  feeder: ['panel', 'motor', 'load'],
  motor: [],
  load: [],
};

export interface OneLineNode {
  id: string;
  projectId: string;
  parentId: string | null;
  type: NodeType;
  name: string;
  /** Sibling display order, also used as phase-assignment row order for panel schedules. */
  order: number;
  data: Record<string, unknown>;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

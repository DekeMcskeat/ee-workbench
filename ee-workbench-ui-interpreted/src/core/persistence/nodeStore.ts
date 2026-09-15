/**
 * One-line node persistence — same v1 pragmatic approach as projectStore.ts
 * (localStorage now, swappable for Dexie/IndexedDB later behind this same
 * function-based interface without touching callers).
 */
import type { NodeType, OneLineNode } from '../domain/node';

const NODES_KEY = 'ee_workbench_nodes_v1';

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readAll(): OneLineNode[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(NODES_KEY);
    return raw ? (JSON.parse(raw) as OneLineNode[]) : [];
  } catch {
    return [];
  }
}

function writeAll(nodes: OneLineNode[]): void {
  if (!hasStorage()) return;
  localStorage.setItem(NODES_KEY, JSON.stringify(nodes));
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function listNodesForProject(projectId: string): OneLineNode[] {
  return readAll().filter(n => n.projectId === projectId).sort((a, b) => a.order - b.order);
}

export function getNode(id: string): OneLineNode | undefined {
  return readAll().find(n => n.id === id);
}

export function createNode(projectId: string, parentId: string | null, type: NodeType, name: string): OneLineNode {
  const now = new Date().toISOString();
  const all = readAll();
  const siblingCount = all.filter(n => n.projectId === projectId && n.parentId === parentId).length;
  const node: OneLineNode = {
    id: newId(), projectId, parentId, type, name: name.trim() || 'Untitled node',
    order: siblingCount, data: {}, result: null, createdAt: now, updatedAt: now,
  };
  writeAll([...all, node]);
  return node;
}

export function updateNodeData(id: string, data: Record<string, unknown>): void {
  const all = readAll();
  const node = all.find(n => n.id === id);
  if (!node) return;
  node.data = data;
  node.updatedAt = new Date().toISOString();
  writeAll(all);
}

export function updateNodeResult(id: string, result: Record<string, unknown> | null): void {
  const all = readAll();
  const node = all.find(n => n.id === id);
  if (!node) return;
  node.result = result;
  node.updatedAt = new Date().toISOString();
  writeAll(all);
}

export function renameNode(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const all = readAll();
  const node = all.find(n => n.id === id);
  if (!node) return;
  node.name = trimmed;
  node.updatedAt = new Date().toISOString();
  writeAll(all);
}

/** Deletes a node and, recursively, everything under it. */
export function deleteNode(id: string): void {
  const all = readAll();
  const toDelete = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of all) {
      if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
        toDelete.add(n.id);
        grew = true;
      }
    }
  }
  writeAll(all.filter(n => !toDelete.has(n.id)));
}

export function deleteNodesForProject(projectId: string): void {
  writeAll(readAll().filter(n => n.projectId !== projectId));
}

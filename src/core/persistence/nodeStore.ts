/**
 * One-line node persistence — backed by IndexedDB via Dexie (`./db.ts`),
 * same function-based interface as projectStore.ts. Every function is
 * async (Promise-returning) since IndexedDB itself is asynchronous.
 */
import { db, hasIndexedDb, migrateFromLocalStorageOnce } from './db';
import { deleteFieldChecksForNode, deleteFieldChecksForProject } from './fieldCheckStore';
import type { NodeType, OneLineNode } from '../domain/node';

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listNodesForProject(projectId: string): Promise<OneLineNode[]> {
  if (!hasIndexedDb()) return [];
  await migrateFromLocalStorageOnce();
  const rows = await db.nodes.where('projectId').equals(projectId).toArray();
  return rows.sort((a, b) => a.order - b.order);
}

export async function getNode(id: string): Promise<OneLineNode | undefined> {
  if (!hasIndexedDb()) return undefined;
  await migrateFromLocalStorageOnce();
  return db.nodes.get(id);
}

export async function createNode(projectId: string, parentId: string | null, type: NodeType, name: string): Promise<OneLineNode> {
  const now = new Date().toISOString();
  let siblingCount = 0;
  if (hasIndexedDb()) {
    await migrateFromLocalStorageOnce();
    siblingCount = await db.nodes.where('projectId').equals(projectId).filter(n => n.parentId === parentId).count();
  }
  const node: OneLineNode = {
    id: newId(), projectId, parentId, type, name: name.trim() || 'Untitled node',
    order: siblingCount, data: {}, result: null, createdAt: now, updatedAt: now,
  };
  if (hasIndexedDb()) await db.nodes.add(node);
  return node;
}

export async function updateNodeData(id: string, data: Record<string, unknown>): Promise<void> {
  if (!hasIndexedDb()) return;
  await migrateFromLocalStorageOnce();
  await db.nodes.update(id, { data, updatedAt: new Date().toISOString() });
}

export async function updateNodeResult(id: string, result: Record<string, unknown> | null): Promise<void> {
  if (!hasIndexedDb()) return;
  await migrateFromLocalStorageOnce();
  await db.nodes.update(id, { result, updatedAt: new Date().toISOString() });
}

export async function renameNode(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || !hasIndexedDb()) return;
  await migrateFromLocalStorageOnce();
  await db.nodes.update(id, { name: trimmed, updatedAt: new Date().toISOString() });
}

/** Deletes a node and, recursively, everything under it. */
export async function deleteNode(id: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await migrateFromLocalStorageOnce();
  const all = await db.nodes.toArray();
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
  await db.nodes.bulkDelete([...toDelete]);
  await Promise.all([...toDelete].map(deleteFieldChecksForNode));
}

export async function deleteNodesForProject(projectId: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await migrateFromLocalStorageOnce();
  const ids = await db.nodes.where('projectId').equals(projectId).primaryKeys();
  await db.nodes.bulkDelete(ids);
  await deleteFieldChecksForProject(projectId);
}

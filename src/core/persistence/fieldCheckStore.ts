/**
 * Field-check persistence — backed by IndexedDB via Dexie (`./db.ts`),
 * same function-based, async interface as nodeStore.ts/projectStore.ts.
 */
import { db, hasIndexedDb, migrateFromLocalStorageOnce } from './db';
import type { FieldCheck } from '../domain/fieldCheck';

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `fc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Newest first, so callers can take [0] for "the latest measurement". */
export async function listFieldChecksForNode(nodeId: string): Promise<FieldCheck[]> {
  if (!hasIndexedDb()) return [];
  await migrateFromLocalStorageOnce();
  const rows = await db.fieldChecks.where('nodeId').equals(nodeId).toArray();
  return rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function listFieldChecksForProject(projectId: string): Promise<FieldCheck[]> {
  if (!hasIndexedDb()) return [];
  await migrateFromLocalStorageOnce();
  const rows = await db.fieldChecks.where('projectId').equals(projectId).toArray();
  return rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function createFieldCheck(
  projectId: string, nodeId: string, subToolId: string, measured: Record<string, number>, note?: string,
): Promise<FieldCheck> {
  const trimmedNote = note?.trim();
  const check: FieldCheck = {
    id: newId(), projectId, nodeId, subToolId, measured,
    timestamp: new Date().toISOString(),
    ...(trimmedNote ? { note: trimmedNote } : {}),
  };
  if (hasIndexedDb()) {
    await migrateFromLocalStorageOnce();
    await db.fieldChecks.add(check);
  }
  return check;
}

export async function deleteFieldCheck(id: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await migrateFromLocalStorageOnce();
  await db.fieldChecks.delete(id);
}

/** Used by nodeStore's cascade delete so a deleted node's field-check history doesn't linger orphaned. */
export async function deleteFieldChecksForNode(nodeId: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await migrateFromLocalStorageOnce();
  const ids = await db.fieldChecks.where('nodeId').equals(nodeId).primaryKeys();
  await db.fieldChecks.bulkDelete(ids);
}

/** Used by projectStore's deleteProject (via nodeStore.deleteNodesForProject). */
export async function deleteFieldChecksForProject(projectId: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await migrateFromLocalStorageOnce();
  const ids = await db.fieldChecks.where('projectId').equals(projectId).primaryKeys();
  await db.fieldChecks.bulkDelete(ids);
}

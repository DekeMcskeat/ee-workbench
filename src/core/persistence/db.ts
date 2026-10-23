/**
 * IndexedDB (via Dexie) database definition, shared by projectStore.ts and
 * nodeStore.ts. Replaces the earlier localStorage-backed v1 implementation
 * (see README "Known gaps") now that real multi-session project data needs
 * a persistence backend that isn't capped by localStorage's ~5MB synchronous
 * string storage.
 *
 * Browser-only by nature, same as the module it replaces: every exported
 * helper no-ops safely if `indexedDB` is unavailable (e.g. imported outside
 * a browser context, or in a test runner).
 */
import Dexie, { type Table } from 'dexie';
import type { Project } from './projectStore';
import type { OneLineNode } from '../domain/node';
import type { FieldCheck } from '../domain/fieldCheck';

export interface MetaRow {
  key: string;
  value: string;
}

class EeWorkbenchDb extends Dexie {
  projects!: Table<Project, string>;
  nodes!: Table<OneLineNode, string>;
  meta!: Table<MetaRow, string>;
  fieldChecks!: Table<FieldCheck, string>;

  constructor() {
    super('ee_workbench');
    this.version(1).stores({
      projects: 'id, name',
      nodes: 'id, projectId, parentId',
      meta: 'key',
    });
    // v2 adds fieldChecks (commissioning/as-built measurements) — every
    // store from v1 must be redeclared here too, or Dexie drops it on
    // upgrade. All existing indexes are unchanged.
    this.version(2).stores({
      projects: 'id, name',
      nodes: 'id, projectId, parentId',
      meta: 'key',
      fieldChecks: 'id, nodeId, projectId, subToolId',
    });
  }
}

export const db = new EeWorkbenchDb();

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

// ---------- One-time migration from the earlier localStorage-backed store ----------
// SOURCING NOTE: these are the exact keys the pre-Dexie projectStore.ts /
// nodeStore.ts used to write to localStorage. Kept here only so existing
// browsers with real project data don't silently lose it on upgrade.
const LEGACY_PROJECTS_KEY = 'ee_workbench_projects_v1';
const LEGACY_NODES_KEY = 'ee_workbench_nodes_v1';
const LEGACY_ACTIVE_KEY = 'ee_workbench_active_project_v1';
export const ACTIVE_PROJECT_META_KEY = 'activeProjectId';

let migration: Promise<void> | null = null;

/**
 * Imports any pre-existing localStorage data into IndexedDB, exactly once
 * per page load, and only if IndexedDB doesn't already hold project data
 * (so it never overwrites real IndexedDB data with a stale localStorage
 * snapshot). Best-effort: a migration failure never blocks normal use —
 * the app just starts fresh in IndexedDB.
 */
export function migrateFromLocalStorageOnce(): Promise<void> {
  if (!migration) migration = migrateFromLocalStorage();
  return migration;
}

async function migrateFromLocalStorage(): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const existingCount = await db.projects.count();
    if (existingCount > 0) return;
    if (typeof localStorage === 'undefined') return;

    const rawProjects = localStorage.getItem(LEGACY_PROJECTS_KEY);
    const rawNodes = localStorage.getItem(LEGACY_NODES_KEY);
    const rawActive = localStorage.getItem(LEGACY_ACTIVE_KEY);
    if (!rawProjects && !rawNodes) return;

    const projects: Project[] = rawProjects ? JSON.parse(rawProjects) : [];
    const nodes: OneLineNode[] = rawNodes ? JSON.parse(rawNodes) : [];

    await db.transaction('rw', db.projects, db.nodes, db.meta, async () => {
      if (projects.length) await db.projects.bulkAdd(projects);
      if (nodes.length) await db.nodes.bulkAdd(nodes);
      if (rawActive) await db.meta.put({ key: ACTIVE_PROJECT_META_KEY, value: rawActive });
    });

    // Legacy keys are left in place (harmless, and cheap insurance if the
    // IndexedDB write above silently failed in some browser) rather than
    // deleted, since deleting a user's only copy of their data on a
    // best-effort path is a bigger risk than a few stale localStorage keys.
  } catch {
    // Best-effort migration — IndexedDB unavailable/blocked, or malformed
    // legacy JSON. Either way, the app proceeds with an empty IndexedDB
    // store rather than throwing during startup.
  }
}

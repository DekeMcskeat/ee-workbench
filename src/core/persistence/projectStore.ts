/**
 * Project persistence — backed by IndexedDB via Dexie (`./db.ts`).
 *
 * Covers only the Project entity (id, name, timestamps) so the UI can
 * support multiple named projects, switching, and renaming. Isolated
 * behind this module's function signatures so the storage backend can be
 * swapped again later without changing callers — every function is async
 * (Promise-returning) since IndexedDB itself is asynchronous.
 *
 * Browser-only by nature (matches the spec's own IndexedDB choice for
 * persistence) — every function no-ops safely if IndexedDB is unavailable
 * (e.g. if ever imported outside a browser context).
 */

import { db, hasIndexedDb, migrateFromLocalStorageOnce, ACTIVE_PROJECT_META_KEY } from './db';
import { deleteNodesForProject } from './nodeStore';

/**
 * Project-level (not global) report branding — firm/company name and a
 * license or contact line, applied to the PDF header and CSV header line in
 * place of the hardcoded "EE Workbench" strings. Text-only for now; a
 * logo-image upload/embed is a reasonable follow-up (pdf-lib does support
 * embedding a PNG) but isn't built this pass — see README.
 */
export interface ProjectBranding {
  firmName?: string;
  licenseOrContact?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Optional — undefined means "use the default EE Workbench branding" everywhere reports are generated. */
  branding?: ProjectBranding;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listProjects(): Promise<Project[]> {
  if (!hasIndexedDb()) return [];
  await migrateFromLocalStorageOnce();
  const all = await db.projects.toArray();
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProject(id: string): Promise<Project | undefined> {
  if (!hasIndexedDb()) return undefined;
  await migrateFromLocalStorageOnce();
  return db.projects.get(id);
}

export async function createProject(name: string): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = { id: newId(), name: name.trim() || 'Untitled project', createdAt: now, updatedAt: now };
  if (hasIndexedDb()) {
    await migrateFromLocalStorageOnce();
    await db.projects.add(project);
  }
  return project;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || !hasIndexedDb()) return;
  await migrateFromLocalStorageOnce();
  await db.projects.update(id, { name: trimmed, updatedAt: new Date().toISOString() });
}

/**
 * Sets this project's report branding. No Dexie schema/version bump is
 * needed here (unlike fieldChecks' v2 bump, which added a whole new
 * object store) — `branding` is just an additional, non-indexed property
 * on an existing `projects` record, and IndexedDB doesn't enforce a fixed
 * document shape beyond declared indexes.
 */
export async function updateProjectBranding(id: string, branding: ProjectBranding): Promise<void> {
  if (!hasIndexedDb()) return;
  await migrateFromLocalStorageOnce();
  const trimmed: ProjectBranding = {
    firmName: branding.firmName?.trim() || undefined,
    licenseOrContact: branding.licenseOrContact?.trim() || undefined,
  };
  await db.projects.update(id, { branding: trimmed, updatedAt: new Date().toISOString() });
}

export async function deleteProject(id: string): Promise<void> {
  if (hasIndexedDb()) {
    await migrateFromLocalStorageOnce();
    await db.projects.delete(id);
  }
  await deleteNodesForProject(id);
}

export async function getActiveProjectId(): Promise<string | null> {
  if (!hasIndexedDb()) return null;
  await migrateFromLocalStorageOnce();
  const row = await db.meta.get(ACTIVE_PROJECT_META_KEY);
  return row?.value ?? null;
}

export async function setActiveProjectId(id: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await migrateFromLocalStorageOnce();
  await db.meta.put({ key: ACTIVE_PROJECT_META_KEY, value: id });
}

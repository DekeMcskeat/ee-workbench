/**
 * Project persistence — v1 pragmatic implementation.
 *
 * The full spec data model (Project/Node/Bus/Conductor/Calculation/...,
 * Dexie + IndexedDB) is not built yet. This module covers only the Project
 * entity (id, name, timestamps) so the UI can support multiple named
 * projects, switching, and renaming, backed by localStorage. It is
 * intentionally isolated behind this module's function signatures so the
 * storage backend can be swapped for Dexie/IndexedDB later without
 * changing callers.
 *
 * Browser-only by nature (matches the spec's own IndexedDB choice for
 * persistence) — every function no-ops safely if `localStorage` is
 * unavailable (e.g. if ever imported outside a browser context).
 */

import { deleteNodesForProject } from './nodeStore';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

const PROJECTS_KEY = 'ee_workbench_projects_v1';
const ACTIVE_KEY = 'ee_workbench_active_project_v1';

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readAll(): Project[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

function writeAll(projects: Project[]): void {
  if (!hasStorage()) return;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function listProjects(): Project[] {
  return readAll().sort((a, b) => a.name.localeCompare(b.name));
}

export function getProject(id: string): Project | undefined {
  return readAll().find(p => p.id === id);
}

export function createProject(name: string): Project {
  const now = new Date().toISOString();
  const project: Project = { id: newId(), name: name.trim() || 'Untitled project', createdAt: now, updatedAt: now };
  writeAll([...readAll(), project]);
  return project;
}

export function renameProject(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const all = readAll();
  const project = all.find(p => p.id === id);
  if (!project) return;
  project.name = trimmed;
  project.updatedAt = new Date().toISOString();
  writeAll(all);
}

export function deleteProject(id: string): void {
  writeAll(readAll().filter(p => p.id !== id));
  deleteNodesForProject(id);
}

export function getActiveProjectId(): string | null {
  if (!hasStorage()) return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProjectId(id: string): void {
  if (!hasStorage()) return;
  localStorage.setItem(ACTIVE_KEY, id);
}

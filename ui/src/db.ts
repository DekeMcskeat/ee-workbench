import Dexie, { type Table } from 'dexie';

export interface Project {
  id?: number;
  name: string;
  jurisdiction: string;
  codeEdition: string;
  createdAt: string;
  updatedAt: string;
}

class WorkbenchDatabase extends Dexie {
  projects!: Table<Project, number>;

  constructor() {
    super('ee-workbench');
    this.version(1).stores({ projects: '++id, name, updatedAt' });
  }
}

export const db = new WorkbenchDatabase();

let projectBootstrap: Promise<Project[]> | undefined;

export function loadOrCreateProjects(): Promise<Project[]> {
  if (!projectBootstrap) {
    projectBootstrap = db.transaction('rw', db.projects, async () => {
      const existing = await db.projects.orderBy('updatedAt').reverse().toArray();
      if (existing.length > 0) return existing;
      const now = new Date().toISOString();
      await db.projects.add({ name: 'Untitled project', jurisdiction: 'US / NEC', codeEdition: 'NEC 2023', createdAt: now, updatedAt: now });
      return db.projects.orderBy('updatedAt').reverse().toArray();
    });
  }
  return projectBootstrap;
}

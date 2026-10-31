import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { atomicWrite } from '../fs/atomic-write.js';
import {
  defaults,
  settingsSchema,
  profileSchema,
  destinationSchema,
  destinationOf,
  suggestedFileName,
} from './settings.js';

const documentSchema = z.object({
  version: z.literal(3),
  mainFolder: destinationSchema.nullable(),
  projects: z.record(z.string(), profileSchema),
});
const previousSchema = z.object({ version: z.literal(2), projects: z.record(z.string(), settingsSchema) });

export class ExportProfiles {
  constructor(file, currentProject) {
    this.file = file;
    this.projects = new Map();
    this.mainFolder = null;
    this.loadError = null;
    if (!file || !existsSync(file)) return;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      if (saved.version === 3) {
        const data = documentSchema.parse(saved);
        this.projects = new Map(Object.entries(data.projects));
        this.mainFolder = data.mainFolder;
      } else {
        // Earlier files used per-project settings (v2) or one global Unity setting.
        const projects =
          saved.version === 2
            ? previousSchema.parse(saved).projects
            : { [currentProject.id]: settingsSchema.parse(saved) };
        this.projects = new Map(
          Object.entries(projects).map(([id, value]) => [id, { ...value, useMainFolder: false }]),
        );
        this.persist(this.projects, null);
      }
    } catch {
      this.projects = new Map();
      this.mainFolder = null;
      this.loadError = 'Project export settings could not be loaded. Open Project info and save them again.';
    }
  }
  profileFor(project) {
    return (
      this.projects.get(project.id) ?? {
        ...defaults,
        fileName: suggestedFileName(project),
        useMainFolder: !!this.mainFolder,
      }
    );
  }
  forProject(project) {
    const profile = this.profileFor(project);
    return { ...profile, ...(profile.useMainFolder && this.mainFolder ? this.mainFolder : {}) };
  }
  stage(project, input) {
    if (input.useAsMainFolder !== undefined && typeof input.useAsMainFolder !== 'boolean')
      throw new Error('The main folder checkbox must be true or false.');
    const settings = settingsSchema.parse(input);
    let mainFolder = this.mainFolder;
    const projects = new Map(this.projects);
    let useMainFolder = this.profileFor(project).useMainFolder;
    if (input.useAsMainFolder === true) {
      mainFolder = destinationOf(settings);
      // First-time setup makes the destination shared by all existing projects.
      if (!this.mainFolder)
        for (const [id, profile] of projects) projects.set(id, { ...profile, useMainFolder: true });
      useMainFolder = true;
    } else if (input.useAsMainFolder === false) useMainFolder = false;
    const profile = { ...settings, useMainFolder };
    projects.set(project.id, profile);
    return {
      projects,
      mainFolder,
      settings: { ...profile, ...(useMainFolder && mainFolder ? mainFolder : {}) },
    };
  }
  commit(draft) {
    this.persist(draft.projects, draft.mainFolder);
    this.projects = draft.projects;
    this.mainFolder = draft.mainFolder;
    this.loadError = null;
  }
  persist(projects, mainFolder) {
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    atomicWrite(
      this.file,
      JSON.stringify({ version: 3, mainFolder, projects: Object.fromEntries(projects) }, null, 2),
    );
  }
}

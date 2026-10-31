import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { atomicWrite } from '../fs/atomic-write.js';

const workspaceSchema = z.object({
  version: z.literal(1),
  projectIds: z.array(z.string().min(1).max(80)).max(4096),
});

// Only open-tab order is stored here. Artwork stays in the project library.
export class ProjectTabs {
  constructor(file, library, currentProject) {
    this.file = file;
    this.items = [];
    this.error = null;
    if (file && existsSync(file)) {
      try {
        const saved = workspaceSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
        for (const id of new Set(saved.projectIds)) {
          if (id === currentProject.id) this.touch(currentProject);
          else {
            try {
              this.touch(library.read(id));
            } catch {
              /* Unavailable artwork stays on disk for recovery. */
            }
          }
        }
      } catch {
        this.error = 'Open project tabs could not be restored. Saved artwork is still available in Projects.';
      }
    }
    this.touch(currentProject);
  }
  touch(project) {
    const existing = this.items.find((item) => item.id === project.id);
    if (existing) existing.name = project.name;
    else this.items.push({ id: project.id, name: project.name });
  }
  remove(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('That project tab is no longer open.');
    if (this.items.length === 1) throw new Error('Keep at least one project tab open.');
    this.items.splice(index, 1);
  }
  snapshot(activeId) {
    return this.items.map((item) => ({ ...item, active: item.id === activeId }));
  }
  save() {
    if (this.file) {
      mkdirSync(path.dirname(this.file), { recursive: true });
      atomicWrite(
        this.file,
        JSON.stringify({ version: 1, projectIds: this.items.map((item) => item.id) }, null, 2),
      );
    }
    this.error = null;
  }
}

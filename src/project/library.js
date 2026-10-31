import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWrite } from '../fs/atomic-write.js';
import { projectSchema } from './schema.js';

export class ProjectLibrary {
  constructor(directory = null) {
    this.directory = directory;
    this.memory = new Map();
  }
  file(id) {
    return path.join(this.directory, createHash('sha256').update(id).digest('hex') + '.pixel.json');
  }
  save(project) {
    if (this.directory) {
      mkdirSync(this.directory, { recursive: true });
      atomicWrite(this.file(project.id), JSON.stringify(project));
    } else this.memory.set(project.id, structuredClone(project));
  }
  read(id) {
    const project = this.directory
      ? projectSchema.parse(JSON.parse(readFileSync(this.file(id), 'utf8')))
      : structuredClone(this.memory.get(id));
    if (!project || project.id !== id) throw new Error('Saved project not found.');
    return project;
  }
  list() {
    if (!this.directory) return [...this.memory.values()];
    if (!existsSync(this.directory)) return [];
    const projects = [];
    for (const file of readdirSync(this.directory).filter((name) => name.endsWith('.pixel.json'))) {
      try {
        projects.push(projectSchema.parse(JSON.parse(readFileSync(path.join(this.directory, file), 'utf8'))));
      } catch {
        /* Keep damaged files on disk for recovery; do not offer them as valid projects. */
      }
    }
    return projects;
  }
}

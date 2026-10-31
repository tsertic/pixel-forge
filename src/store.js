import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createProject, operationsSchema, projectSchema, applyOperation, summary } from './model.js';
import { ProjectLibrary } from './project/library.js';
import { ProjectTabs } from './project/tabs.js';

export class Store extends EventEmitter {
  constructor(file) {
    super();
    this.file = file;
    this.library = new ProjectLibrary(file ? path.join(path.dirname(file), 'projects') : null);
    this.project = createProject();
    this.revision = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.projectHistories = new Map();
    this.activity = [];
    this.saveError = null;
    if (file && existsSync(file)) {
      // Refuse to overwrite a corrupt save silently. The original file stays available for recovery.
      this.project = projectSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    }
    this.projectTabs = new ProjectTabs(
      file ? path.join(path.dirname(file), 'workspace.json') : null,
      this.library,
      this.project,
    );
  }
  snapshot() {
    return {
      project: this.project,
      revision: this.revision,
      canUndo: !!this.undoStack.length,
      canRedo: !!this.redoStack.length,
      activity: this.activity,
      saveError: this.saveError,
      projectTabs: this.projectTabs.snapshot(this.project.id),
      tabsError: this.projectTabs.error,
    };
  }
  trim(stack) {
    let bytes = 0;
    for (let i = stack.length - 1; i >= 0; i--) {
      bytes += stack[i].length * 2;
      if (bytes > 24 * 1024 * 1024) {
        stack.splice(0, i + 1);
        break;
      }
    }
    if (stack.length > 60) stack.splice(0, stack.length - 60);
  }
  save() {
    try {
      this.library.save(this.project);
      if (this.file) {
        mkdirSync(path.dirname(this.file), { recursive: true });
        writeFileSync(this.file + '.tmp', JSON.stringify(this.project));
        renameSync(this.file + '.tmp', this.file);
      }
      this.projectTabs.save();
      this.saveError = null;
    } catch (error) {
      this.saveError = error.message;
    }
  }
  commit(next, actor, label, undoable = true, { closeTabId = null, initialProject = null } = {}) {
    // Save the previous character before switching; a failed archive leaves it active.
    const switching = next.id !== this.project.id;
    if (switching) {
      this.library.save(this.project);
      this.projectHistories.set(this.project.id, { undo: this.undoStack, redo: this.redoStack });
      const history = this.projectHistories.get(next.id);
      this.undoStack = history?.undo ?? [];
      this.redoStack = history?.redo ?? [];
    }
    if (undoable && !switching) {
      this.undoStack.push(JSON.stringify(this.project));
      this.trim(this.undoStack);
      this.redoStack = [];
    }
    if (switching && initialProject && JSON.stringify(initialProject) !== JSON.stringify(next)) {
      this.undoStack.push(JSON.stringify(initialProject));
      this.trim(this.undoStack);
    }
    this.project = next;
    this.projectTabs.touch(next);
    if (closeTabId) this.projectTabs.remove(closeTabId);
    this.revision++;
    this.activity.unshift({ actor, label, time: new Date().toISOString(), revision: this.revision });
    this.activity.length = Math.min(30, this.activity.length);
    this.save();
    this.emit('change', this.snapshot());
    return { revision: this.revision, project: summary(this.project), saved: !this.saveError };
  }
  apply(input, actor = 'You', label = 'Canvas updated', projectId) {
    if (projectId && projectId !== this.project.id)
      throw new Error('The project changed. Refresh before drawing.');
    const ops = operationsSchema.parse(input);
    let next = structuredClone(this.project);
    let initialProject = null;
    // Work on a clone so a rejected command rolls back the complete batch.
    for (const operation of ops) {
      next = applyOperation(next, operation);
      if (operation.type === 'new_project') initialProject = structuredClone(next);
    }
    return this.commit(
      next,
      actor,
      label,
      ops.some((o) => o.type !== 'select'),
      { initialProject },
    );
  }
  replace(input, actor = 'You') {
    return this.commit(projectSchema.parse(input), actor, 'Project imported');
  }
  listProjects() {
    const projects = new Map(this.library.list().map((project) => [project.id, project]));
    projects.set(this.project.id, this.project);
    return [...projects.values()].map((project) => ({
      id: project.id,
      name: project.name,
      width: project.width,
      height: project.height,
      animations: project.animations.length,
      active: project.id === this.project.id,
    }));
  }
  openProject(id, expectedProjectId) {
    if (expectedProjectId && expectedProjectId !== this.project.id)
      throw new Error('The project changed. Reopen Projects.');
    if (id === this.project.id)
      return { revision: this.revision, project: summary(this.project), saved: !this.saveError };
    return this.commit(this.library.read(id), 'You', 'Project tab selected', false);
  }
  closeProjectTab(id, expectedProjectId) {
    if (expectedProjectId && expectedProjectId !== this.project.id)
      throw new Error('The project changed. Try closing the tab again.');
    const tabs = this.projectTabs.items;
    const index = tabs.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('That project tab is no longer open.');
    if (tabs.length === 1) throw new Error('Keep at least one project tab open.');
    const next =
      id === this.project.id ? this.library.read(tabs[index - 1]?.id ?? tabs[index + 1].id) : this.project;
    return this.commit(next, 'You', 'Project tab closed', false, { closeTabId: id });
  }
  history(direction, actor = 'You') {
    const from = direction === 'undo' ? this.undoStack : this.redoStack,
      to = direction === 'undo' ? this.redoStack : this.undoStack;
    if (!from.length) throw new Error(`Nothing to ${direction}.`);
    to.push(JSON.stringify(this.project));
    this.trim(to);
    return this.commit(JSON.parse(from.pop()), actor, direction === 'undo' ? 'Undo' : 'Redo', false);
  }
}

import { ExportProfiles } from './profiles.js';
import { PngExporter } from './png-exporter.js';

export class ProjectSync {
  constructor(store, { file = null, onChange = () => {}, delay = 400 } = {}) {
    this.store = store;
    this.onChange = onChange;
    this.delay = delay;
    this.profiles = new ExportProfiles(file, store.project);
    this.exporter = new PngExporter();
    this.projectId = store.project.id;
    this.settings = this.profiles.forProject(store.project);
    this.lastExport = null;
    this.error = this.profiles.loadError;
    this.pending = false;
    this.listener = () => {
      if (this.projectId !== store.project.id) this.activateProject();
      this.schedule();
    };
    store.on('change', this.listener);
    if (this.settings.enabled) this.schedule();
  }
  activateProject() {
    clearTimeout(this.timer);
    this.projectId = this.store.project.id;
    this.settings = this.profiles.forProject(this.store.project);
    this.lastExport = null;
    this.error = null;
    this.pending = false;
    this.onChange();
  }
  snapshot() {
    return {
      ...this.settings,
      useAsMainFolder: !!(this.settings.useMainFolder && this.profiles.mainFolder),
      mainFolder: this.profiles.mainFolder,
      projectId: this.projectId,
      lastExport: this.lastExport,
      error: this.error,
      pending: this.pending,
    };
  }
  configure(input) {
    if (input.projectId && input.projectId !== this.store.project.id)
      throw new Error('The project changed. Reopen Project info before saving its settings.');
    const draft = this.profiles.stage(this.store.project, input);
    if (draft.settings.enabled) this.exporter.prepare(this.store.project, draft.settings);
    else if (input.useAsMainFolder === true) this.exporter.paths(draft.settings);
    this.profiles.commit(draft);
    clearTimeout(this.timer);
    this.settings = draft.settings;
    this.pending = false;
    this.error = null;
    if (this.settings.enabled) this.flush();
    else this.onChange();
    return this.snapshot();
  }
  schedule() {
    if (!this.settings.enabled) return;
    clearTimeout(this.timer);
    this.pending = true;
    this.onChange();
    this.timer = setTimeout(() => this.flush(), this.delay);
    this.timer.unref?.();
  }
  flush() {
    clearTimeout(this.timer);
    this.pending = false;
    if (!this.settings.enabled) return this.snapshot();
    try {
      this.lastExport = this.exporter.write(this.store.project, this.settings, this.store.revision);
      this.error = null;
    } catch (error) {
      this.error = error.message;
    }
    this.onChange();
    return this.snapshot();
  }
  close() {
    clearTimeout(this.timer);
    this.store.off('change', this.listener);
  }
}

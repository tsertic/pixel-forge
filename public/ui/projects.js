import { $ } from './dom.js';

export function bindProjectLibrary({ getProject, perform, openDialog, toast }) {
  $('projects').onclick = async () => {
    const projectId = getProject().id;
    try {
      const response = await fetch('/api/projects');
      const projects = await response.json();
      if (!response.ok) throw new Error(projects.error);
      const list = $('projectList');
      list.replaceChildren();
      for (const project of projects) {
        const button = document.createElement('button');
        button.className = 'project-entry';
        button.dataset.project = project.id;
        const name = document.createElement('strong');
        name.textContent = project.name;
        const details = document.createElement('span');
        details.textContent = `${project.width} × ${project.height} · ${project.animations} animation${project.animations === 1 ? '' : 's'}${project.active ? ' · Current' : ''}`;
        button.append(name, details);
        button.disabled = project.active;
        button.onclick = async () => {
          const result = await perform('/api/projects/open', { id: project.id, projectId });
          if (result) $('projectsDialog').close();
        };
        list.append(button);
      }
      openDialog('projectsDialog');
    } catch (error) {
      toast(error.message, true);
    }
  };
}

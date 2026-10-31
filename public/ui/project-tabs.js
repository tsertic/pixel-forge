import { $ } from './dom.js';

export function createProjectTabs({ getSnapshot, perform, toast }) {
  let previous = '',
    busy = false,
    lastError = null;
  const container = $('projectTabs');
  $('newProjectTab').onclick = () => $('new').click();

  async function navigate(url, id) {
    if (busy) return;
    busy = true;
    container.setAttribute('aria-busy', 'true');
    try {
      await perform(url, { id, projectId: getSnapshot().project.id });
    } finally {
      busy = false;
      container.removeAttribute('aria-busy');
    }
  }
  function render(snapshot) {
    if (snapshot.tabsError && snapshot.tabsError !== lastError) toast(snapshot.tabsError, true);
    lastError = snapshot.tabsError;
    const tabs = snapshot.projectTabs ?? [
      { id: snapshot.project.id, name: snapshot.project.name, active: true },
    ];
    const key = JSON.stringify(tabs);
    if (key === previous) return;
    previous = key;
    const scroll = container.scrollLeft;
    const focused =
      document.activeElement?.dataset.projectTab ?? document.activeElement?.dataset.closeProjectTab;
    const previousActive = container.querySelector('[aria-selected="true"]')?.dataset.projectTab;
    container.replaceChildren();
    for (const project of tabs) {
      const tab = document.createElement('div');
      tab.className = 'project-tab';
      tab.setAttribute('role', 'presentation');
      tab.classList.toggle('active', project.active);
      const button = document.createElement('button');
      button.className = 'project-tab-name';
      button.dataset.projectTab = project.id;
      button.textContent = project.name;
      button.title = project.name;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'projectEditor');
      button.setAttribute('aria-label', project.name);
      button.setAttribute('aria-selected', String(project.active));
      button.tabIndex = project.active ? 0 : -1;
      button.onclick = () => {
        if (!project.active) navigate('/api/projects/open', project.id);
      };
      button.onkeydown = (event) => {
        const index = tabs.findIndex((item) => item.id === project.id);
        let next;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs.at(-1);
        if (next) {
          event.preventDefault();
          navigate('/api/projects/open', next.id);
        }
      };
      const close = document.createElement('button');
      close.className = 'project-tab-close';
      close.dataset.closeProjectTab = project.id;
      close.textContent = '×';
      close.title = `Close ${project.name} tab (keeps the saved project)`;
      close.setAttribute('aria-label', `Close project tab: ${project.name}`);
      close.disabled = tabs.length === 1;
      close.onclick = () => navigate('/api/projects/close-tab', project.id);
      tab.append(button, close);
      container.append(tab);
    }
    container.scrollLeft = scroll;
    const buttons = [...container.querySelectorAll('[role="tab"]')];
    if (focused)
      buttons
        .find((button) => button.dataset.projectTab === snapshot.project.id)
        ?.focus({ preventScroll: true });
    if (previousActive !== snapshot.project.id)
      container
        .querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  return { render };
}

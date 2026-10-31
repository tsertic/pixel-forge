import { $ } from './ui/dom.js';
import { tools } from './tools/index.js';
import { createDrawingController } from './editor/drawing-controller.js';
import { createCanvasView } from './editor/canvas-view.js';
import { createLayerPanel } from './ui/layers.js';
import { createPalettePanel } from './ui/palette.js';
import { renderActivity } from './ui/activity.js';
import { bindFileActions } from './ui/files.js';
import { bindMcpConnection } from './ui/mcp-connection.js';
import { createProjectInfo } from './ui/project-info.js';
import { createTimeline } from './ui/timeline.js';
import { animationFrames } from '../shared/animations.js';
import { bindProjectLibrary } from './ui/projects.js';
import { createProjectTabs } from './ui/project-tabs.js';
let state = null,
  tool = 'pencil',
  color = '#98c987',
  mirror = false,
  online = false;
let requestQueue = Promise.resolve(),
  toastTimer,
  renderedProjectId = null;

const getProject = () => state?.project;
const canvasView = createCanvasView({ getProject, getPlayback: () => timeline.state, action, stopPlayback });
const drawCanvas = () => canvasView.draw();
const composed = (frameId) => canvasView.composed(frameId);
const fitZoom = () => canvasView.fit();
const timeline = createTimeline({ getProject, action, drawCanvas });
function stopPlayback() {
  timeline.stop();
}
const drawing = createDrawingController({
  getProject,
  isOnline: () => online,
  selectedTool: () => tool,
  selectedColor: () => color,
  getZoom: () => canvasView.zoom,
  getMirror: () => mirror,
  stopPlayback,
  action,
  setColor,
  composed,
  toast,
  setZoom: (value) => canvasView.setZoom(value),
});
const layers = createLayerPanel({ getProject, action });
const palette = createPalettePanel({ getProject, getColor: () => color, setColor, action, toast });
const projectInfo = createProjectInfo({ getSnapshot: () => state, request, perform, openDialog, toast });
const projectTabs = createProjectTabs({ getSnapshot: () => state, perform, toast });
bindFileActions({ getProject, action, perform, openDialog, toast });
bindProjectLibrary({ getProject, perform, openDialog, toast });
bindMcpConnection({ openDialog, toast });

function toast(message, error = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 6500 : 3200);
}
async function request(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'The command failed.');
  return result;
}
function perform(url, body) {
  const next = requestQueue
    .then(() => request(url, body))
    .catch((error) => {
      toast(error.message, true);
      return null;
    });
  requestQueue = next;
  return next;
}
function action(operations, label = 'Canvas updated', projectId = state?.project.id) {
  if (!online) {
    toast('The editor is disconnected. Check that the server is running.', true);
    return Promise.resolve(null);
  }
  return perform('/api/actions', { operations, label, projectId });
}
function selectTool(value) {
  tool = value;
  for (const button of $('toolButtons').children)
    button.classList.toggle('active', button.dataset.tool === tool);
  const item = tools.find((t) => t.id === tool);
  $('toolName').textContent = item.name;
  $('toolKey').textContent = item.key;
  $('interaction').style.cursor = tool === 'picker' ? 'copy' : 'crosshair';
}
function setColor(value) {
  color = value;
  const solid = value ?? '#98c987';
  $('primaryColor').firstElementChild.style.background =
    value ?? 'repeating-conic-gradient(#555 0 25%,#333 0 50%) 0/8px 8px';
  $('colorDot').style.background = value ?? 'transparent';
  $('hex').value = value ? value.slice(1) : '';
  $('colorPicker').value = solid.slice(0, 7);
  $('transparent').classList.toggle('active', !value);
  for (const button of $('palette').children)
    button.classList.toggle('active', button.dataset.color === color);
  if (value && tool === 'eraser') selectTool('pencil');
}
for (const item of tools) {
  const button = document.createElement('button');
  button.title = `${item.name} (${item.key})`;
  button.setAttribute('aria-label', item.name);
  button.dataset.tool = item.id;
  button.innerHTML = `<svg viewBox="0 0 22 22" aria-hidden="true">${item.icon}</svg>`;
  button.onclick = () => selectTool(item.id);
  $('toolButtons').append(button);
}
selectTool('pencil');
setColor(color);

function receive(next) {
  const previousId = state?.project.id;
  state = next;
  projectTabs.render(state);
  canvasView.clearCache();
  timeline.update();
  const p = state.project;
  $('projectTitle').firstChild.textContent = p.name + ' ';
  $('previewName').textContent = p.name;
  $('canvasSize').textContent = `${p.width} × ${p.height}`;
  $('canvasLabel').textContent = p.name.toUpperCase().slice(0, 32);
  const frames = animationFrames(p);
  $('frameCount').textContent = `${frames.length} ${frames.length === 1 ? 'FRAME' : 'FRAMES'}`;
  if (document.activeElement !== $('fps')) $('fps').value = p.fps;
  $('undo').disabled = !next.canUndo;
  $('redo').disabled = !next.canRedo;
  $('deleteFrame').disabled = frames.length === 1;
  $('saveStatus').textContent = next.saveError
    ? 'Save failed · download your project'
    : 'Autosaved · on this computer only';
  $('saveStatus').style.color = next.saveError ? '#efb09d' : '';
  palette.render();
  layers.render();
  canvasView.renderFrames();
  drawCanvas();
  if (renderedProjectId !== p.id) {
    renderedProjectId = p.id;
    requestAnimationFrame(fitZoom);
  } else canvasView.setZoom(canvasView.zoom);
  drawing.update();
  renderActivity(state);
  projectInfo.update();
  $('emptyHint').hidden = p.frames.some((f) =>
    Object.values(f.cels).some((pixels) => pixels.some((c) => c !== null)),
  );
  if (previousId && previousId !== p.id) stopPlayback();
}

const events = new EventSource('/api/events');
events.onopen = () => {
  online = true;
  $('connection').classList.remove('offline');
  $('connection').innerHTML = '<i></i> Live canvas';
};
events.onmessage = (event) => {
  try {
    receive(JSON.parse(event.data));
  } catch (error) {
    toast(error.message, true);
  }
};
events.onerror = () => {
  online = false;
  $('connection').classList.add('offline');
  $('connection').innerHTML = '<i></i> Reconnecting…';
};
$('mirror').onclick = () => {
  mirror = !mirror;
  $('mirror').classList.toggle('active', mirror);
};
$('undo').onclick = () => perform('/api/history', { direction: 'undo' });
$('redo').onclick = () => perform('/api/history', { direction: 'redo' });
function openDialog(id) {
  stopPlayback();
  $(id).showModal();
}
for (const button of document.querySelectorAll('[data-close]'))
  button.onclick = () => button.closest('dialog').close();
for (const dialog of document.querySelectorAll('dialog'))
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        dialog.close();
    }
  });
window.addEventListener('keydown', (event) => {
  if (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
    document.querySelector('dialog[open]')
  )
    return;
  const key = event.key.toLowerCase(),
    ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && key === 'z') {
    event.preventDefault();
    event.shiftKey ? $('redo').click() : $('undo').click();
    return;
  }
  if (ctrl && key === 'y') {
    event.preventDefault();
    $('redo').click();
    return;
  }
  if (ctrl && key === 's') {
    event.preventDefault();
    $('save').click();
    return;
  }
  if (ctrl || event.altKey) return;
  if (key === 'escape') {
    drawing.cancel();
    return;
  }
  const match = tools.find((t) => t.key.toLowerCase() === key);
  if (match) {
    event.preventDefault();
    selectTool(match.id);
  }
  if (key === 'g') $('grid').click();
  if (key === ' ') {
    event.preventDefault();
    $('play').click();
  }
  if (key === '+' || key === '=') $('zoomIn').click();
  if (key === '-') $('zoomOut').click();
  if (key === '0') fitZoom();
});
window.addEventListener('resize', () => {
  if (state) canvasView.setZoom(canvasView.zoom);
});

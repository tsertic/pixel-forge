import { $ } from '../ui/dom.js';
import { getTool } from '../tools/index.js';

export function createDrawingController({
  getProject,
  isOnline,
  selectedTool,
  selectedColor,
  getZoom,
  getMirror,
  stopPlayback,
  action,
  setColor,
  composed,
  toast,
  setZoom,
}) {
  let stroke = null;
  const canvas = $('interaction');
  function position(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.floor((event.clientX - bounds.left) / getZoom()),
      y: Math.floor((event.clientY - bounds.top) / getZoom()),
    };
  }
  function clear() {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }
  function render() {
    clear();
    if (!stroke) return;
    const context = canvas.getContext('2d');
    context.fillStyle = stroke.color ?? '#ffffff';
    context.globalAlpha = stroke.color ? 0.85 : 0.38;
    for (const pixel of getTool(stroke.tool).preview(stroke)) context.fillRect(pixel.x, pixel.y, 1, 1);
    context.globalAlpha = 1;
  }
  function update() {
    if (stroke?.projectId !== getProject()?.id) stroke = null;
    render();
  }
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    const project = getProject();
    if (!project || !isOnline() || stroke || ![0, 2].includes(event.button)) return;
    event.preventDefault();
    stopPlayback();
    const point = position(event);
    if (point.x < 0 || point.y < 0 || point.x >= project.width || point.y >= project.height) return;
    const tool = getTool(event.altKey ? 'picker' : selectedTool());
    const layer = project.layers.find((layer) => layer.id === project.activeLayerId);
    if (!tool.readOnly && layer.locked) {
      toast('This layer is locked.', true);
      return;
    }
    const target = { frameId: project.activeFrameId, layerId: project.activeLayerId };
    const color = tool.erase || event.button === 2 ? null : selectedColor();
    if (tool.kind === 'instant') {
      tool.activate({ point, color, target, action, setColor, preview: composed(project.activeFrameId) });
      return;
    }
    stroke = {
      projectId: project.id,
      ...target,
      tool: tool.id,
      start: point,
      last: point,
      color,
      size: Number($('brushSize').value),
      filled: $('filled').checked,
      mirror: getMirror(),
      pixels: new Map(),
      pointerId: event.pointerId,
    };
    canvas.setPointerCapture(event.pointerId);
    tool.append?.(stroke, point, point, project);
    render();
  });
  canvas.addEventListener('pointermove', (event) => {
    const project = getProject();
    if (!project) return;
    const raw = position(event);
    $('coordinates').textContent = `X ${raw.x}   Y ${raw.y}`;
    if (!stroke) return;
    const point = {
      x: Math.max(0, Math.min(project.width - 1, raw.x)),
      y: Math.max(0, Math.min(project.height - 1, raw.y)),
    };
    getTool(stroke.tool).append?.(stroke, stroke.last, point, project);
    stroke.last = point;
    render();
  });
  canvas.addEventListener('pointerup', async (event) => {
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    const completed = stroke,
      tool = getTool(completed.tool);
    const operation = {
      ...tool.operation(completed),
      frameId: completed.frameId,
      layerId: completed.layerId,
    };
    stroke = null;
    await action([operation], tool.name, completed.projectId);
    if (!stroke) clear();
  });
  canvas.addEventListener('pointercancel', (event) => {
    if (stroke?.pointerId === event.pointerId) cancel();
  });
  canvas.addEventListener('pointerleave', () => {
    if (!stroke) $('coordinates').textContent = 'X —   Y —';
  });
  $('stage').addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        setZoom(getZoom() + (event.deltaY < 0 ? 1 : -1));
      }
    },
    { passive: false },
  );
  function cancel() {
    stroke = null;
    clear();
  }
  return { update, cancel };
}

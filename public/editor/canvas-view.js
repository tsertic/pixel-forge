import { $ } from '../ui/dom.js';
import { animationFrames } from '../../shared/animations.js';

export function celCanvas(p, pixels) {
  const canvas = document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext('2d'),
    data = ctx.createImageData(p.width, p.height);
  for (let i = 0; i < pixels.length; i++) {
    const c = pixels[i];
    if (!c) continue;
    data.data[i * 4] = parseInt(c.slice(1, 3), 16);
    data.data[i * 4 + 1] = parseInt(c.slice(3, 5), 16);
    data.data[i * 4 + 2] = parseInt(c.slice(5, 7), 16);
    data.data[i * 4 + 3] = c.length === 9 ? parseInt(c.slice(7, 9), 16) : 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export function createCanvasView({ getProject, getPlayback, action, stopPlayback }) {
  let zoom = 12,
    showGrid = true,
    onion = false;
  const frameCache = new Map();
  function composed(frameId) {
    if (frameCache.has(frameId)) return frameCache.get(frameId);
    const p = getProject(),
      frame = p.frames.find((f) => f.id === frameId),
      canvas = document.createElement('canvas');
    canvas.width = p.width;
    canvas.height = p.height;
    const ctx = canvas.getContext('2d');
    for (const l of p.layers)
      if (l.visible) {
        ctx.globalAlpha = l.opacity;
        ctx.drawImage(celCanvas(p, frame.cels[l.id]), 0, 0);
      }
    frameCache.set(frameId, canvas);
    return canvas;
  }
  function fitZoom() {
    if (!getProject()) return;
    const rect = $('stage').getBoundingClientRect();
    setZoom(
      Math.max(
        1,
        Math.min(
          32,
          Math.floor(
            Math.min((rect.width - 100) / getProject().width, (rect.height - 75) / getProject().height),
          ),
        ),
      ),
    );
  }
  function setZoom(value) {
    zoom = Math.max(1, Math.min(32, value));
    if (!getProject()) return;
    const p = getProject();
    $('canvasStack').style.width = p.width * zoom + 'px';
    $('canvasStack').style.height = p.height * zoom + 'px';
    $('art').style.width = p.width * zoom + 'px';
    $('art').style.height = p.height * zoom + 'px';
    $('interaction').style.width = p.width * zoom + 'px';
    $('interaction').style.height = p.height * zoom + 'px';
    $('pixelGrid').style.backgroundSize = `${zoom}px ${zoom}px`;
    $('pixelGrid').hidden = !showGrid || zoom < 4;
    $('zoomLabel').textContent = zoom * 100 + '%';
  }
  function drawCanvas() {
    const { playing, playIndex } = getPlayback();
    if (!getProject()) return;
    const p = getProject(),
      frames = animationFrames(p),
      frameId = playing ? frames[playIndex % frames.length].id : p.activeFrameId;
    const canvas = $('art');
    if (canvas.width !== p.width || canvas.height !== p.height) {
      canvas.width = p.width;
      canvas.height = p.height;
      $('interaction').width = p.width;
      $('interaction').height = p.height;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, p.width, p.height);
    const index = frames.findIndex((f) => f.id === frameId);
    if (onion && !playing && index > 0) {
      ctx.globalAlpha = 0.23;
      ctx.drawImage(composed(frames[index - 1].id), 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(composed(frameId), 0, 0);
    const preview = $('preview');
    preview.width = p.width;
    preview.height = p.height;
    const previewZoom = Math.min(4, 128 / p.width, 124 / p.height);
    preview.style.width = p.width * previewZoom + 'px';
    preview.style.height = p.height * previewZoom + 'px';
    preview.getContext('2d').drawImage(composed(frameId), 0, 0);
    $('previewScale').textContent = `${Number(previewZoom.toFixed(1))}×`;
    for (const button of $('frames').children)
      button.classList.toggle('playing', playing && button.dataset.frame === frameId);
  }
  function renderFrames() {
    const container = $('frames'),
      scroll = container.scrollLeft;
    container.replaceChildren();
    const p = getProject();
    for (const [index, frame] of animationFrames(p).entries()) {
      const button = document.createElement('button');
      button.className = 'frame-card';
      button.classList.toggle('active', frame.id === p.activeFrameId);
      button.dataset.frame = frame.id;
      button.title = `Frame ${index + 1}`;
      button.setAttribute('aria-label', `Frame ${index + 1}`);
      const canvas = composed(frame.id).cloneNode();
      canvas.getContext('2d').drawImage(composed(frame.id), 0, 0);
      const factor = Math.min(50 / p.width, 50 / p.height);
      canvas.style.width = p.width * factor + 'px';
      canvas.style.height = p.height * factor + 'px';
      const label = document.createElement('span');
      label.textContent = String(index + 1).padStart(2, '0');
      button.append(canvas, label);
      button.onclick = () => {
        stopPlayback();
        action([{ type: 'select', frameId: frame.id }], 'Frame selected');
      };
      container.append(button);
    }
    container.scrollLeft = scroll;
  }
  $('grid').onclick = () => {
    showGrid = !showGrid;
    $('grid').classList.toggle('active', showGrid);
    setZoom(zoom);
  };
  $('onion').onclick = () => {
    onion = !onion;
    $('onion').classList.toggle('active', onion);
    drawCanvas();
  };
  $('zoomIn').onclick = () => setZoom(zoom + 1);
  $('zoomOut').onclick = () => setZoom(zoom - 1);
  $('zoomFit').onclick = fitZoom;

  return {
    composed,
    draw: drawCanvas,
    renderFrames,
    fit: fitZoom,
    setZoom,
    get zoom() {
      return zoom;
    },
    clearCache: () => frameCache.clear(),
  };
}

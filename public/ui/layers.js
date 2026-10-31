import { $ } from './dom.js';
import { celCanvas } from '../editor/canvas-view.js';
import { animationFrames, animationFor } from '../../shared/animations.js';

export function createLayerPanel({ getProject, action }) {
  function renderLayers() {
    const p = getProject(),
      frame = p.frames.find((f) => f.id === p.activeFrameId);
    $('layers').replaceChildren();
    for (const layer of [...p.layers].reverse()) {
      const row = document.createElement('div');
      row.className = 'layer';
      row.classList.toggle('active', layer.id === p.activeLayerId);
      row.dataset.layer = layer.id;
      const visibility = document.createElement('button');
      visibility.textContent = layer.visible ? '◉' : '○';
      visibility.title = layer.visible ? 'Hide layer' : 'Show layer';
      visibility.setAttribute('aria-label', `${visibility.title}: ${layer.name}`);
      visibility.onclick = (e) => {
        e.stopPropagation();
        action([{ type: 'update_layer', layerId: layer.id, visible: !layer.visible }], 'Layer visibility');
      };
      const thumbnail = celCanvas(p, frame.cels[layer.id]);
      const label = document.createElement('span');
      label.className = 'layer-name';
      label.textContent = layer.name;
      label.title = 'Double-click to rename';
      label.ondblclick = (e) => {
        e.stopPropagation();
        const name = prompt('Layer name:', layer.name);
        if (name?.trim())
          action([{ type: 'update_layer', layerId: layer.id, name: name.trim() }], 'Layer renamed');
      };
      const lock = document.createElement('button');
      lock.textContent = layer.locked ? '▣' : '◇';
      lock.title = layer.locked ? 'Unlock layer' : 'Lock layer';
      lock.setAttribute('aria-label', `${lock.title}: ${layer.name}`);
      lock.onclick = (e) => {
        e.stopPropagation();
        action([{ type: 'update_layer', layerId: layer.id, locked: !layer.locked }], 'Layer lock');
      };
      row.append(visibility, thumbnail, label, lock);
      row.onclick = () => action([{ type: 'select', layerId: layer.id }], 'Layer selected');
      $('layers').append(row);
    }
    const layer = p.layers.find((l) => l.id === p.activeLayerId);
    $('opacity').value = Math.round(layer.opacity * 100);
    $('opacityValue').textContent = Math.round(layer.opacity * 100) + '%';
    $('selectionInfo').textContent =
      `${layer.name} · ${animationFor(p).name} · Frame ${animationFrames(p).findIndex((f) => f.id === p.activeFrameId) + 1}`;
    $('deleteLayer').disabled = p.layers.length === 1;
  }
  $('addLayer').onclick = () => {
    const name = prompt('New layer name:', `Layer ${getProject().layers.length + 1}`);
    if (name?.trim()) action([{ type: 'add_layer', name: name.trim() }], 'Layer added');
  };
  $('deleteLayer').onclick = () => {
    if (confirm('Delete this layer from all frames?'))
      action([{ type: 'delete_layer', layerId: getProject().activeLayerId }], 'Layer deleted');
  };
  $('layerUp').onclick = () =>
    action([{ type: 'update_layer', layerId: getProject().activeLayerId, move: 'up' }], 'Layer order');
  $('layerDown').onclick = () =>
    action([{ type: 'update_layer', layerId: getProject().activeLayerId, move: 'down' }], 'Layer order');
  $('opacity').oninput = (e) => ($('opacityValue').textContent = e.target.value + '%');
  $('opacity').onchange = (e) =>
    action(
      [{ type: 'update_layer', layerId: getProject().activeLayerId, opacity: Number(e.target.value) / 100 }],
      'Layer opacity',
    );

  return { render: renderLayers };
}

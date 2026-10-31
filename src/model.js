import { randomUUID } from 'node:crypto';
import { PALETTE } from './project/schema.js';
import { applyDrawingOperation } from './drawing/index.js';
import { animationFor, animationFrames } from '../shared/animations.js';
import { applyAnimationOperation, selectAnimation } from './project/animations.js';
export { PALETTE, colorSchema, operationsSchema, projectSchema } from './project/schema.js';
export { linePoints } from '../shared/raster.js';

export function createProject(title = 'Untitled sprite', width = 32, height = 32) {
  const layerId = randomUUID(),
    frameId = randomUUID(),
    animationId = randomUUID();
  return {
    format: 'pixel-forge-v1',
    id: randomUUID(),
    name: title,
    width,
    height,
    fps: 8,
    palette: [...PALETTE],
    layers: [{ id: layerId, name: 'Artwork', visible: true, locked: false, opacity: 1 }],
    animations: [{ id: animationId, name: 'Idle', fps: 8 }],
    activeAnimationId: animationId,
    frames: [{ id: frameId, animationId, cels: { [layerId]: Array(width * height).fill(null) } }],
    activeLayerId: layerId,
    activeFrameId: frameId,
  };
}

export function getTarget(p, o = {}) {
  const frame = p.frames.find((f) => f.id === (o.frameId ?? p.activeFrameId));
  const layer = p.layers.find((l) => l.id === (o.layerId ?? p.activeLayerId));
  if (!frame || !layer) throw new Error('Frame or layer no longer exists. Read the project again.');
  return { frame, layer, pixels: frame.cels[layer.id] };
}

export function applyOperation(p, o) {
  if (o.type === 'new_project') return createProject(o.name, o.width, o.height);
  if (['add_animation', 'update_animation', 'delete_animation'].includes(o.type))
    return applyAnimationOperation(p, o);
  if (o.type === 'select') {
    getTarget(p, o);
    if (o.animationId || o.frameId) {
      const frame = o.frameId ? p.frames.find((frame) => frame.id === o.frameId) : null;
      selectAnimation(p, o.animationId ?? frame.animationId, o.frameId);
    }
    if (o.layerId) p.activeLayerId = o.layerId;
    return p;
  }
  if (o.type === 'settings') {
    for (const key of ['name', 'fps', 'palette']) if (o[key] !== undefined) p[key] = o[key];
    if (o.fps !== undefined) animationFor(p).fps = o.fps;
    return p;
  }
  if (o.type === 'add_layer') {
    if (p.layers.length >= 16 || p.width * p.height * (p.layers.length + 1) * p.frames.length > 1048576)
      throw new Error('Layer / project size limit reached.');
    const layer = { id: randomUUID(), name: o.name, visible: true, locked: false, opacity: 1 };
    p.layers.push(layer);
    p.activeLayerId = layer.id;
    for (const f of p.frames) f.cels[layer.id] = Array(p.width * p.height).fill(null);
    return p;
  }
  if (o.type === 'update_layer' || o.type === 'delete_layer') {
    const index = p.layers.findIndex((l) => l.id === o.layerId);
    if (index < 0) throw new Error('Unknown layer.');
    if (o.type === 'delete_layer') {
      if (p.layers.length === 1) throw new Error('Keep at least one layer.');
      p.layers.splice(index, 1);
      for (const f of p.frames) delete f.cels[o.layerId];
      if (p.activeLayerId === o.layerId) p.activeLayerId = p.layers[Math.max(0, index - 1)].id;
    } else {
      for (const key of ['name', 'visible', 'locked', 'opacity'])
        if (o[key] !== undefined) p.layers[index][key] = o[key];
      const next = index + (o.move === 'up' ? 1 : o.move === 'down' ? -1 : 0);
      if (next >= 0 && next < p.layers.length)
        [p.layers[index], p.layers[next]] = [p.layers[next], p.layers[index]];
    }
    return p;
  }
  if (o.type === 'add_frame') {
    if (p.frames.length >= 64 || p.width * p.height * p.layers.length * (p.frames.length + 1) > 1048576)
      throw new Error('Frame / project size limit reached.');
    const source = o.frameId
      ? p.frames.find((f) => f.id === o.frameId)
      : (animationFrames(p, o.animationId ?? p.activeAnimationId).find((f) => f.id === p.activeFrameId) ??
        animationFrames(p, o.animationId ?? p.activeAnimationId).at(-1));
    if (!source) throw new Error('Unknown frame.');
    if (o.animationId && source.animationId !== o.animationId)
      throw new Error('Frame does not belong to this animation.');
    const frame = { id: randomUUID(), animationId: source.animationId, cels: {} };
    for (const l of p.layers)
      frame.cels[l.id] = o.duplicate ? [...source.cels[l.id]] : Array(p.width * p.height).fill(null);
    p.frames.splice(p.frames.indexOf(source) + 1, 0, frame);
    selectAnimation(p, frame.animationId, frame.id);
    return p;
  }
  if (o.type === 'delete_frame') {
    const index = p.frames.findIndex((f) => f.id === o.frameId);
    if (index < 0) throw new Error('Unknown frame.');
    const frame = p.frames[index];
    const siblings = animationFrames(p, frame.animationId);
    if (siblings.length === 1) throw new Error('Keep at least one frame in each animation.');
    p.frames.splice(index, 1);
    if (p.activeFrameId === o.frameId)
      selectAnimation(p, frame.animationId, siblings.find((f) => f.id !== frame.id).id);
    return p;
  }
  const { pixels, layer } = getTarget(p, o);
  if (layer.locked) throw new Error('This layer is locked. Unlock it before drawing.');
  applyDrawingOperation(p, pixels, o);
  return p;
}

export function composite(p, frameId = p.activeFrameId) {
  const frame = p.frames.find((f) => f.id === frameId);
  if (!frame) throw new Error('Unknown frame.');
  const data = new Uint8Array(p.width * p.height * 4);
  for (const l of p.layers)
    if (l.visible && l.opacity > 0) {
      for (let i = 0; i < p.width * p.height; i++) {
        const c = frame.cels[l.id][i];
        if (!c) continue;
        const a = (c.length === 9 ? parseInt(c.slice(7, 9), 16) / 255 : 1) * l.opacity,
          da = data[i * 4 + 3] / 255,
          out = a + da * (1 - a);
        if (!out) continue;
        for (let k = 0; k < 3; k++)
          data[i * 4 + k] = Math.round(
            (parseInt(c.slice(1 + k * 2, 3 + k * 2), 16) * a + data[i * 4 + k] * da * (1 - a)) / out,
          );
        data[i * 4 + 3] = Math.round(out * 255);
      }
    }
  return data;
}

export function summary(p) {
  return {
    id: p.id,
    name: p.name,
    width: p.width,
    height: p.height,
    fps: p.fps,
    palette: p.palette,
    activeLayerId: p.activeLayerId,
    activeFrameId: p.activeFrameId,
    activeAnimationId: p.activeAnimationId,
    animations: p.animations.map((animation) => ({
      ...animation,
      frameCount: animationFrames(p, animation.id).length,
    })),
    layers: p.layers,
    frames: p.frames.map((f, i) => ({ id: f.id, index: i, animationId: f.animationId })),
  };
}

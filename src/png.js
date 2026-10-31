import { PNG } from 'pngjs';
import { composite } from './model.js';
import { animationFor, animationFrames, animationFileName } from '../shared/animations.js';

export function exportSelection(project, { animationId, frameId, sheet = false } = {}) {
  const frame = frameId ? project.frames.find((item) => item.id === frameId) : null;
  if (frameId && !frame) throw new Error('Unknown frame.');
  const animation = animationFor(project, animationId ?? frame?.animationId ?? project.activeAnimationId);
  if (frame && frame.animationId !== animation.id)
    throw new Error('Frame does not belong to this animation.');
  const frames = sheet
    ? animationFrames(project, animation.id)
    : [
        frame ??
          project.frames.find(
            (item) => item.id === project.activeFrameId && item.animationId === animation.id,
          ) ??
          animationFrames(project, animation.id)[0],
      ];
  return { animation, frames, fileName: animationFileName(project, animation.id) };
}

export function renderPNG(project, { frameId, animationId, sheet = false, scale = 1 } = {}) {
  if (!Number.isInteger(scale) || scale < 1 || scale > 16)
    throw new Error('Scale must be an integer from 1 to 16.');
  const { frames } = exportSelection(project, { frameId, animationId, sheet });
  const width = project.width * frames.length * scale,
    height = project.height * scale;
  if (width * height > 16777216) throw new Error('Export exceeds 16 megapixels. Use a smaller scale.');
  const png = new PNG({ width, height });
  for (let f = 0; f < frames.length; f++) {
    const rgba = composite(project, frames[f].id);
    for (let y = 0; y < project.height; y++)
      for (let x = 0; x < project.width; x++)
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const from = (y * project.width + x) * 4,
              to = ((y * scale + sy) * width + (f * project.width + x) * scale + sx) * 4;
            for (let c = 0; c < 4; c++) png.data[to + c] = rgba[from + c];
          }
  }
  return PNG.sync.write(png);
}

export function sheetMetadata(p, { scale = 1, sheet = true, frameId, animationId } = {}) {
  const { frames, animation, fileName } = exportSelection(p, { frameId, animationId, sheet });
  return {
    name: p.name,
    image: fileName + '.png',
    animation: { ...animation },
    frameWidth: p.width * scale,
    frameHeight: p.height * scale,
    fps: animation.fps,
    layout: 'horizontal',
    frames: frames.map((f, i) => ({
      index: i,
      id: f.id,
      x: i * p.width * scale,
      y: 0,
      width: p.width * scale,
      height: p.height * scale,
      duration: Math.round(1000 / animation.fps),
    })),
    meta: {
      app: 'Pixel Forge',
      version: 1,
      scale,
      size: { w: p.width * frames.length * scale, h: p.height * scale },
    },
  };
}

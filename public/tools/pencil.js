import { linePoints } from '../../shared/raster.js';

export const pencil = {
  id: 'pencil',
  name: 'Pencil',
  key: 'B',
  kind: 'brush',
  icon: '<path d="m4 16 1-5L15 1l4 4L9 15l-5 1Z"/><path d="m12 4 4 4M5 11l4 4M3 19h15"/>',
  append(stroke, from, to, project) {
    const offset = Math.floor((stroke.size - 1) / 2);
    for (const [px, py] of linePoints(from.x, from.y, to.x, to.y)) {
      for (let by = 0; by < stroke.size; by++) {
        for (let bx = 0; bx < stroke.size; bx++) {
          const x = px + bx - offset,
            y = py + by - offset;
          if (x < 0 || y < 0 || x >= project.width || y >= project.height) continue;
          stroke.pixels.set(`${x},${y}`, { x, y, color: stroke.color });
          if (stroke.mirror) {
            const mirrorX = project.width - 1 - x;
            stroke.pixels.set(`${mirrorX},${y}`, { x: mirrorX, y, color: stroke.color });
          }
        }
      }
    }
  },
  preview: (stroke) => [...stroke.pixels.values()],
  operation: (stroke) => ({ type: 'pixels', pixels: [...stroke.pixels.values()] }),
};

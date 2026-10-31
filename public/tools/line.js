import { linePoints } from '../../shared/raster.js';

export const line = {
  id: 'line',
  name: 'Line',
  key: 'L',
  kind: 'shape',
  icon: '<path d="m4 17 13-13"/><path d="M2 16h3v3H2zM16 2h3v3h-3z"/>',
  preview: (stroke) =>
    linePoints(stroke.start.x, stroke.start.y, stroke.last.x, stroke.last.y).map(([x, y]) => ({ x, y })),
  operation: (stroke) => ({
    type: 'line',
    x1: stroke.start.x,
    y1: stroke.start.y,
    x2: stroke.last.x,
    y2: stroke.last.y,
    color: stroke.color,
  }),
};

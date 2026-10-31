import { ellipsePoints, strokeBounds } from '../../shared/raster.js';

export const ellipse = {
  id: 'ellipse',
  name: 'Ellipse',
  key: 'O',
  kind: 'shape',
  icon: '<ellipse cx="10.5" cy="10.5" rx="8" ry="7"/>',
  preview: (stroke) => ellipsePoints(strokeBounds(stroke), stroke.filled).map(([x, y]) => ({ x, y })),
  operation: (stroke) => ({
    type: 'ellipse',
    ...strokeBounds(stroke),
    filled: stroke.filled,
    color: stroke.color,
  }),
};

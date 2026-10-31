import { rectanglePoints, strokeBounds } from '../../shared/raster.js';

export const rectangle = {
  id: 'rect',
  name: 'Rectangle',
  key: 'R',
  kind: 'shape',
  icon: '<rect x="3" y="4" width="15" height="13" rx=".5"/>',
  preview: (stroke) => rectanglePoints(strokeBounds(stroke), stroke.filled).map(([x, y]) => ({ x, y })),
  operation: (stroke) => ({
    type: 'rect',
    ...strokeBounds(stroke),
    filled: stroke.filled,
    color: stroke.color,
  }),
};

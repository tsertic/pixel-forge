import { linePoints } from '../../../shared/raster.js';

export function drawLine({ put }, operation) {
  for (const [x, y] of linePoints(operation.x1, operation.y1, operation.x2, operation.y2))
    put(x, y, operation.color);
}

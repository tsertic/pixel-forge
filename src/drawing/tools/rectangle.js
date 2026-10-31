import { rectanglePoints } from '../../../shared/raster.js';

export function drawRectangle({ put }, operation) {
  for (const [x, y] of rectanglePoints(operation, operation.filled)) put(x, y, operation.color);
}

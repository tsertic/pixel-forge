import { ellipsePoints } from '../../../shared/raster.js';

export function drawEllipse({ put }, operation) {
  for (const [x, y] of ellipsePoints(operation, operation.filled)) put(x, y, operation.color);
}

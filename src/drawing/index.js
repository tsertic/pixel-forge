import { drawPixels } from './tools/pixels.js';
import { drawLine } from './tools/line.js';
import { drawRectangle } from './tools/rectangle.js';
import { drawEllipse } from './tools/ellipse.js';
import { floodFill } from './tools/fill.js';
import { clearCel } from './tools/clear.js';
import { paintSprite } from './tools/sprite.js';
import { transformCel } from './tools/transform.js';

const handlers = {
  pixels: drawPixels,
  line: drawLine,
  rect: drawRectangle,
  ellipse: drawEllipse,
  fill: floodFill,
  clear: clearCel,
  sprite: paintSprite,
  transform: transformCel,
};

export function applyDrawingOperation(project, pixels, operation) {
  const handler = handlers[operation.type];
  if (!handler) throw new Error(`Unknown drawing operation: ${operation.type}`);
  const { width, height } = project;
  const put = (x, y, color) => {
    if (x >= 0 && y >= 0 && x < width && y < height) pixels[y * width + x] = color;
  };
  handler({ pixels, width, height, put }, operation);
}

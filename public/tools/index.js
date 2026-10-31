import { pencil } from './pencil.js';
import { eraser } from './eraser.js';
import { fill } from './fill.js';
import { eyedropper } from './eyedropper.js';
import { line } from './line.js';
import { rectangle } from './rectangle.js';
import { ellipse } from './ellipse.js';

export const tools = [pencil, eraser, fill, eyedropper, line, rectangle, ellipse];
export const getTool = (id) => tools.find((tool) => tool.id === id);

import { z } from 'zod';
import { colorSchema } from '../../model.js';
import { target, expected } from '../schemas.js';

export function registerTool(register, store) {
  register(
    'pixel_paint_sprite',
    'Efficient pixel art: rows of single-character symbols and colors mapping. Dot skips existing pixels. A symbol mapped to null erases. Row 0 is top; x,y position the sprite. Example rows [".aa.","abba"], colors {"a":"#ffffff","b":"#151b2e"}.',
    {
      ...expected,
      ...target,
      x: z.number().int().min(-4096).max(4096).default(0),
      y: z.number().int().min(-4096).max(4096).default(0),
      rows: z.array(z.string().max(256)).min(1).max(256),
      colors: z.record(z.string().length(1), colorSchema),
      transparent: z.string().length(1).default('.'),
      label: z.string().min(1).max(100).default('AI sprite'),
    },
    false,
    (args) => store.apply([{ ...args, type: 'sprite' }], 'MCP', args.label, args.projectId),
  );
}

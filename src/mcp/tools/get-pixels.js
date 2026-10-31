import { z } from 'zod';
import { getTarget } from '../../model.js';
import { target } from '../schemas.js';

export function registerTool(register, store) {
  register(
    'pixel_get_pixels',
    'Read exact colors on a layer. Returns rows of #hex / null, maximum 64×64 per call.',
    {
      ...target,
      x: z.number().int().min(0).default(0),
      y: z.number().int().min(0).default(0),
      width: z.number().int().min(1).max(64).optional(),
      height: z.number().int().min(1).max(64).optional(),
    },
    true,
    (args) => {
      const p = store.project,
        { pixels } = getTarget(p, args),
        width = args.width ?? Math.min(64, p.width - args.x),
        height = args.height ?? Math.min(64, p.height - args.y);
      if (args.x + width > p.width || args.y + height > p.height || width < 1 || height < 1)
        throw new Error('Read region is outside canvas.');
      return {
        x: args.x,
        y: args.y,
        width,
        height,
        rows: Array.from({ length: height }, (_, y) =>
          pixels.slice((y + args.y) * p.width + args.x, (y + args.y) * p.width + args.x + width),
        ),
      };
    },
  );
}

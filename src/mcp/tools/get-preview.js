import { z } from 'zod';
import { renderPNG } from '../../png.js';

export function registerTool(register, store) {
  register(
    'pixel_get_preview',
    'Get a PNG image of the visible composite to inspect your drawing. Transparent background; nearest-neighbor scaling.',
    { frameId: z.string().optional(), scale: z.number().int().min(1).max(16).default(8) },
    true,
    (args) => ({
      content: [
        { type: 'image', mimeType: 'image/png', data: renderPNG(store.project, args).toString('base64') },
      ],
    }),
  );
}

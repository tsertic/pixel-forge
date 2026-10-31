import { z } from 'zod';
import { renderPNG, sheetMetadata } from '../../png.js';

export function registerTool(register, store) {
  register(
    'pixel_export',
    'Export a transparent PNG of one animation, optionally its frames as a horizontal sprite sheet. Defaults to the selected animation. Includes project-animation filename, frame coordinates, animation ID/name, and timing metadata. Automatic game-engine export remains controlled by Project info.',
    {
      frameId: z.string().optional(),
      animationId: z.string().optional(),
      sheet: z.boolean().default(false),
      scale: z.number().int().min(1).max(16).default(1),
    },
    true,
    (args) => ({
      content: [
        { type: 'image', mimeType: 'image/png', data: renderPNG(store.project, args).toString('base64') },
        { type: 'text', text: JSON.stringify(sheetMetadata(store.project, args)) },
      ],
    }),
  );
}

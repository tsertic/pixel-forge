import { z } from 'zod';
import { colorSchema } from '../../model.js';
import { target, expected } from '../schemas.js';
import { assertCharacterTarget } from '../character-target.js';

export function registerTool(register, store) {
  register(
    'pixel_paint_sprite',
    'Draw a sprite in the selected character project. Required: projectId, intent="edit_character", and characterName matching the character project. For a NEW character such as Wizard when Skeleton is open, call pixel_create_character first; never add it to the old project. Rows contain single-character symbols with colors mapping; dot skips pixels, null erases. Row 0 is top.',
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
    (args) => {
      const operations = [{ ...args, type: 'sprite' }];
      assertCharacterTarget(store, args, operations);
      return store.apply(operations, 'MCP', args.label, args.projectId);
    },
  );
}

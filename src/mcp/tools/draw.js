import { z } from 'zod';
import { operationsSchema } from '../../model.js';
import { expected } from '../schemas.js';
import { assertCharacterTarget } from '../character-target.js';

export function registerTool(register, store) {
  register(
    'pixel_draw',
    'Apply an atomic batch to one character project. Required: projectId, intent, characterName. For a NEW character call pixel_create_character first; never create a Wizard layer or Wizard Idle group inside Skeleton. For edits use intent="edit_character" and the actual character/project name. Supports pixels, shapes, sprites, transforms, layers, animation groups, frames, selection, and settings. Advanced new-character batches require intent="new_character", matching characterName, and new_project as the first operation. Failed batches commit nothing.',
    { ...expected, operations: operationsSchema, label: z.string().min(1).max(100).default('AI drawing') },
    false,
    (args) => {
      assertCharacterTarget(store, args, args.operations);
      return store.apply(args.operations, 'MCP', args.label, args.projectId);
    },
  );
}

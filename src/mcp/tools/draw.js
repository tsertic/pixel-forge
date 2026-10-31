import { z } from 'zod';
import { operationsSchema } from '../../model.js';
import { expected } from '../schemas.js';

export function registerTool(register, store) {
  register(
    'pixel_draw',
    'Apply an atomic batch to the live project. Supports pixels, shapes, sprite, transform, layer/frame CRUD, add_animation, update_animation, delete_animation, selection (animationId/frameId/layerId), settings. Later operations see earlier ones. Locked layers reject drawing. A failed batch changes nothing. For a new character or separate asset, first use new_project with a meaningful name and canvas size, then read the new IDs. Keep the project when adjusting the same character or adding its animation groups.',
    { ...expected, operations: operationsSchema, label: z.string().min(1).max(100).default('AI drawing') },
    false,
    (args) => store.apply(args.operations, 'MCP', args.label, args.projectId),
  );
}

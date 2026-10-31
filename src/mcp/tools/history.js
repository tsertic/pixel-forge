import { z } from 'zod';

export function registerTool(register, store) {
  register(
    'pixel_history',
    'Undo or redo the last change in the currently selected project, including human edits. Each project tab keeps its own history until server restart. Does not undo tab switching or close/create projects. Read project afterward if frame, layer, or animation IDs changed.',
    { direction: z.enum(['undo', 'redo']) },
    false,
    (args) => store.history(args.direction, 'MCP'),
  );
}

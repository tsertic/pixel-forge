import { z } from 'zod';

export function registerTool(register, store) {
  register(
    'pixel_create_character',
    'REQUIRED FIRST STEP for drawing a NEW character or separate asset. Creates a suitably named project in a NEW tab, preserving the previous character. Example: user requests a wizard while Skeleton is open -> name="Wizard". Do not use add_layer or add_animation to switch characters. Returns the new project IDs; use these for subsequent edits.',
    {
      name: z.string().trim().min(1).max(80),
      width: z.number().int().min(1).max(256).default(32),
      height: z.number().int().min(1).max(256).default(32),
      expectedProjectId: z.string().optional(),
    },
    false,
    (args) =>
      store.apply(
        [{ type: 'new_project', name: args.name, width: args.width, height: args.height }],
        'MCP',
        `New character: ${args.name}`,
        args.expectedProjectId,
      ),
  );
}

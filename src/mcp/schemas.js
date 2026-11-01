import { z } from 'zod';

export const target = { frameId: z.string().optional(), layerId: z.string().optional() };
export const expected = {
  projectId: z
    .string()
    .min(1)
    .describe('ID from pixel_get_project. Rejects stale edits if the user opened a different project.'),
  intent: z
    .enum(['new_character', 'edit_character'])
    .describe(
      'Choose from the user request: a different character is new_character, never an edit of the old character.',
    ),
  characterName: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe(
      'Name of the character/asset you are actually drawing. For edits it must match the project name. For a different character, call pixel_create_character first.',
    ),
};

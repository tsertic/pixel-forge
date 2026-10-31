import { z } from 'zod';

export const target = { frameId: z.string().optional(), layerId: z.string().optional() };
export const expected = {
  projectId: z
    .string()
    .optional()
    .describe('ID from pixel_get_project. Rejects stale edits if the user opened a different project.'),
};

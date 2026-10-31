import { z } from 'zod';
import { slugify } from '../../shared/animations.js';

export const defaults = {
  engine: 'unity',
  enabled: false,
  folder: '',
  fileName: 'sprite',
  pixelsPerUnit: 32,
  installImporter: true,
};
export const settingsSchema = z.object({
  engine: z.enum(['unity', 'unreal']).default('unity'),
  enabled: z.boolean(),
  folder: z.string().trim().max(2048),
  fileName: z
    .string()
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/,
      'Use letters, numbers, underscores, or hyphens (no extension).',
    )
    .refine((value) => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value), 'Choose another filename.'),
  pixelsPerUnit: z.number().int().min(1).max(1000),
  installImporter: z.boolean(),
});
export const profileSchema = settingsSchema.extend({ useMainFolder: z.boolean().default(false) });
export const destinationSchema = settingsSchema.pick({
  engine: true,
  folder: true,
  pixelsPerUnit: true,
  installImporter: true,
});
export const destinationOf = (settings) => destinationSchema.parse(settings);

export function suggestedFileName(project) {
  const name = slugify(project.name);
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name) ? `${name}-sprite` : name;
}

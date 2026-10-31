import { z } from 'zod';
import { slugify } from '../../shared/animations.js';

export const PALETTE = [
  '#151b2e',
  '#303754',
  '#596078',
  '#a3adc2',
  '#e8e5db',
  '#ffffff',
  '#743d49',
  '#b45959',
  '#eb7a66',
  '#ffb66c',
  '#f6d98a',
  '#98c987',
  '#4e916e',
  '#286259',
  '#347b9b',
  '#64b5c6',
  '#8c77b5',
  '#c6a0d4',
  '#d486a2',
  '#edb8bc',
  '#504336',
  '#87644d',
  '#b7956b',
  '#dac4a0',
];
export const colorSchema = z
  .string()
  .regex(/^#[\da-fA-F]{6}([\da-fA-F]{2})?$/)
  .transform((s) => s.toLowerCase())
  .nullable();
const id = z.string().min(1).max(80);
const name = z.string().trim().min(1).max(80);
const size = z.number().int().min(1).max(256);
const coord = z.number().int().min(-4096).max(4096);
const point = z.object({ x: coord, y: coord });
const target = { frameId: id.optional(), layerId: id.optional() };
export const operationsSchema = z
  .array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('new_project'), name, width: size, height: size }),
      z.object({ type: z.literal('add_animation'), name, duplicate: z.boolean().default(false) }),
      z.object({
        type: z.literal('update_animation'),
        animationId: id,
        name: name.optional(),
        fps: z.number().int().min(1).max(60).optional(),
      }),
      z.object({ type: z.literal('delete_animation'), animationId: id }),
      z.object({
        type: z.literal('pixels'),
        ...target,
        pixels: z.array(point.extend({ color: colorSchema })).max(65536),
      }),
      z.object({
        type: z.literal('line'),
        ...target,
        x1: coord,
        y1: coord,
        x2: coord,
        y2: coord,
        color: colorSchema,
      }),
      z.object({
        type: z.literal('rect'),
        ...target,
        x: coord,
        y: coord,
        width: size,
        height: size,
        color: colorSchema,
        filled: z.boolean().default(true),
      }),
      z.object({
        type: z.literal('ellipse'),
        ...target,
        x: coord,
        y: coord,
        width: size,
        height: size,
        color: colorSchema,
        filled: z.boolean().default(true),
      }),
      z.object({ type: z.literal('fill'), ...target, x: coord, y: coord, color: colorSchema }),
      z.object({ type: z.literal('clear'), ...target }),
      z.object({
        type: z.literal('sprite'),
        ...target,
        x: coord.default(0),
        y: coord.default(0),
        rows: z.array(z.string().max(256)).min(1).max(256),
        colors: z.record(z.string().length(1), colorSchema),
        transparent: z.string().length(1).default('.'),
      }),
      z.object({
        type: z.literal('transform'),
        ...target,
        direction: z.enum(['flip_x', 'flip_y', 'left', 'right', 'up', 'down']),
      }),
      z.object({ type: z.literal('add_layer'), name }),
      z.object({
        type: z.literal('update_layer'),
        layerId: id,
        name: name.optional(),
        visible: z.boolean().optional(),
        opacity: z.number().min(0).max(1).optional(),
        locked: z.boolean().optional(),
        move: z.enum(['up', 'down']).optional(),
      }),
      z.object({ type: z.literal('delete_layer'), layerId: id }),
      z.object({
        type: z.literal('add_frame'),
        duplicate: z.boolean().default(false),
        frameId: id.optional(),
        animationId: id.optional(),
      }),
      z.object({ type: z.literal('delete_frame'), frameId: id }),
      z.object({ type: z.literal('select'), ...target, animationId: id.optional() }),
      z.object({
        type: z.literal('settings'),
        name: name.optional(),
        fps: z.number().int().min(1).max(60).optional(),
        palette: z
          .array(colorSchema.refine((c) => c !== null))
          .min(1)
          .max(128)
          .optional(),
      }),
    ]),
  )
  .min(1)
  .max(256);

const groupedProjectSchema = z
  .object({
    format: z.literal('pixel-forge-v1'),
    id,
    name,
    width: size,
    height: size,
    fps: z.number().int().min(1).max(60),
    palette: z
      .array(colorSchema.refine((c) => c !== null))
      .min(1)
      .max(128),
    layers: z
      .array(
        z.object({ id, name, visible: z.boolean(), locked: z.boolean(), opacity: z.number().min(0).max(1) }),
      )
      .min(1)
      .max(16),
    frames: z
      .array(z.object({ id, animationId: id, cels: z.record(z.string(), z.array(colorSchema).max(65536)) }))
      .min(1)
      .max(64),
    activeLayerId: id,
    activeFrameId: id,
    animations: z
      .array(z.object({ id, name, fps: z.number().int().min(1).max(60) }))
      .min(1)
      .max(32),
    activeAnimationId: id,
  })
  .superRefine((p, ctx) => {
    const bad = (message) => ctx.addIssue({ code: 'custom', message });
    if (p.width * p.height * p.layers.length * p.frames.length > 1048576)
      bad('Project limit: 1,048,576 total pixels across frames and layers.');
    if (
      new Set(p.layers.map((l) => l.id)).size !== p.layers.length ||
      new Set(p.frames.map((f) => f.id)).size !== p.frames.length
    )
      bad('Duplicate IDs.');
    if (new Set(p.animations.map((a) => a.id)).size !== p.animations.length) bad('Duplicate animation IDs.');
    if (new Set(p.animations.map((a) => slugify(a.name, 'animation'))).size !== p.animations.length)
      bad('Animation names must produce distinct export filenames.');
    if (
      !p.animations.some((a) => a.id === p.activeAnimationId) ||
      p.frames.find((f) => f.id === p.activeFrameId)?.animationId !== p.activeAnimationId
    )
      bad('Invalid animation selection.');
    if (p.animations.find((a) => a.id === p.activeAnimationId)?.fps !== p.fps)
      bad('Project FPS must match the active animation.');
    for (const animation of p.animations)
      if (!p.frames.some((f) => f.animationId === animation.id))
        bad('Each animation needs at least one frame.');
    if (p.frames.some((f) => !p.animations.some((a) => a.id === f.animationId)))
      bad('Unknown frame animation.');
    if (!p.layers.some((l) => l.id === p.activeLayerId) || !p.frames.some((f) => f.id === p.activeFrameId))
      bad('Invalid selection.');
    for (const f of p.frames) {
      if (Object.keys(f.cels).length !== p.layers.length) bad('Unexpected cel count.');
      for (const l of p.layers)
        if (f.cels[l.id]?.length !== p.width * p.height) bad('Invalid cel dimensions.');
    }
  });

// Old project files and autosaves become one Idle animation without changing pixels or IDs.
export const projectSchema = z.preprocess((input) => {
  if (!input || typeof input !== 'object' || input.animations !== undefined) return input;
  return {
    ...input,
    animations: [{ id: 'idle', name: 'Idle', fps: input.fps }],
    activeAnimationId: 'idle',
    frames: Array.isArray(input.frames)
      ? input.frames.map((frame) => ({ ...frame, animationId: 'idle' }))
      : input.frames,
  };
}, groupedProjectSchema);

import { summary } from '../../model.js';

export function registerTool(register, store) {
  register(
    'pixel_get_project',
    'Read canvas dimensions, palette, animation groups with FPS and frame counts, all layer/frame IDs and animation membership, active selection, undo availability, and revision. Start here, and read again after creating a new character project or animation.',
    {},
    true,
    () => ({
      ...summary(store.project),
      revision: store.revision,
      canUndo: !!store.undoStack.length,
      canRedo: !!store.redoStack.length,
    }),
  );
}

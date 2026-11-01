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
      drawingPolicy:
        'One character per project. For a different character call pixel_create_character first (e.g. Wizard while Skeleton is open). Drawing requires intent=edit_character, characterName equal to the actual project/character name, and projectId. Do not add another character as a layer or animation.',
    }),
  );
}

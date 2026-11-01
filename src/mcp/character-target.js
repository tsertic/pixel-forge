const normalized = (name) => name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

export function assertCharacterTarget(store, args, operations) {
  if (args.projectId !== store.project.id)
    throw new Error('The selected project changed. Call pixel_get_project again before drawing.');
  const starts = operations.filter((operation) => operation.type === 'new_project');
  if (args.intent === 'new_character') {
    if (starts.length !== 1 || operations[0].type !== 'new_project')
      throw new Error(
        'A new character needs its own project. Call pixel_create_character with a suitable name, then draw using intent="edit_character" and the returned project ID/name. Do not add a character layer or animation to the previous project.',
      );
    if (normalized(starts[0].name) !== normalized(args.characterName))
      throw new Error('The new project name must match the character you are creating.');
    return;
  }
  if (starts.length)
    throw new Error(
      'Use pixel_create_character for a new character, or declare intent="new_character" for a batch beginning with new_project.',
    );
  if (normalized(args.characterName) !== normalized(store.project.name))
    throw new Error(
      `You requested "${args.characterName}" but the selected project is "${store.project.name}". Call pixel_create_character for the new character first. Existing characters must stay in their own projects.`,
    );
}

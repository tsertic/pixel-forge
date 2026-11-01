// Integration fixtures explicitly declare the intended character, as real clients must.
export function callWithCharacter(client, store, request) {
  if (!['pixel_draw', 'pixel_paint_sprite'].includes(request.name)) return client.callTool(request);
  const start = request.arguments?.operations?.find((operation) => operation.type === 'new_project');
  return client.callTool({
    ...request,
    arguments: {
      projectId: store.project.id,
      intent: start ? 'new_character' : 'edit_character',
      characterName: start?.name ?? store.project.name,
      ...request.arguments,
    },
  });
}

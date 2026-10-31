// Shared by the editor, PNG export, and MCP metadata.
export function animationFor(project, animationId = project.activeAnimationId) {
  const animation = project.animations.find((item) => item.id === animationId);
  if (!animation) throw new Error('Unknown animation. Read the project again.');
  return animation;
}

export function animationFrames(project, animationId = project.activeAnimationId) {
  animationFor(project, animationId);
  return project.frames.filter((frame) => frame.animationId === animationId);
}

export function slugify(value, fallback = 'sprite') {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || fallback
  );
}

export function animationFileName(project, animationId = project.activeAnimationId, baseName = project.name) {
  return `${slugify(baseName)}-${slugify(animationFor(project, animationId).name, 'animation')}`;
}

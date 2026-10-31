import { randomUUID } from 'node:crypto';
import { animationFor, animationFrames, slugify } from '../../shared/animations.js';

function checkName(project, name, exceptId) {
  const slug = slugify(name, 'animation');
  if (project.animations.some((item) => item.id !== exceptId && slugify(item.name, 'animation') === slug))
    throw new Error('Choose a distinct animation name so exports do not overwrite another animation.');
}

export function selectAnimation(project, animationId, frameId) {
  const animation = animationFor(project, animationId);
  const frames = animationFrames(project, animation.id);
  if (frameId && !frames.some((frame) => frame.id === frameId))
    throw new Error('Frame does not belong to this animation.');
  project.activeAnimationId = animation.id;
  project.activeFrameId = frameId ?? frames[0].id;
  project.fps = animation.fps;
}

export function applyAnimationOperation(project, operation) {
  if (operation.type === 'add_animation') {
    checkName(project, operation.name);
    const source = animationFrames(project);
    const count = operation.duplicate ? source.length : 1;
    if (
      project.animations.length >= 32 ||
      project.frames.length + count > 64 ||
      project.width * project.height * project.layers.length * (project.frames.length + count) > 1048576
    )
      throw new Error('Animation / frame / project size limit reached.');
    const animation = { id: randomUUID(), name: operation.name, fps: animationFor(project).fps };
    const frames = operation.duplicate
      ? source.map((frame) => ({ ...structuredClone(frame), id: randomUUID(), animationId: animation.id }))
      : [
          {
            id: randomUUID(),
            animationId: animation.id,
            cels: Object.fromEntries(
              project.layers.map((layer) => [layer.id, Array(project.width * project.height).fill(null)]),
            ),
          },
        ];
    project.animations.push(animation);
    project.frames.push(...frames);
    selectAnimation(project, animation.id);
  } else if (operation.type === 'update_animation') {
    const animation = animationFor(project, operation.animationId);
    if (operation.name !== undefined) {
      checkName(project, operation.name, animation.id);
      animation.name = operation.name;
    }
    if (operation.fps !== undefined) animation.fps = operation.fps;
    if (animation.id === project.activeAnimationId) project.fps = animation.fps;
  } else {
    animationFor(project, operation.animationId);
    if (project.animations.length === 1) throw new Error('Keep at least one animation.');
    project.animations = project.animations.filter((item) => item.id !== operation.animationId);
    project.frames = project.frames.filter((frame) => frame.animationId !== operation.animationId);
    if (project.activeAnimationId === operation.animationId)
      selectAnimation(project, project.animations[0].id);
  }
  return project;
}

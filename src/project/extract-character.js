import { randomUUID } from 'node:crypto';
import { projectSchema } from './schema.js';

// Copy selected artwork without sharing mutable cels or changing source pixels.
export function extractCharacter(
  source,
  { name, layerIds, animationIds, keepProjectId = false, idleName = false },
) {
  const selectedLayers = source.layers.filter((layer) => layerIds.includes(layer.id));
  const selectedAnimations = source.animations.filter((animation) => animationIds.includes(animation.id));
  if (selectedLayers.length !== layerIds.length || selectedAnimations.length !== animationIds.length)
    throw new Error('Character extraction references an unknown layer or animation.');
  const layerMap = new Map(
    selectedLayers.map((layer) => [layer.id, keepProjectId ? layer.id : randomUUID()]),
  );
  const animationMap = new Map(
    selectedAnimations.map((animation) => [animation.id, keepProjectId ? animation.id : randomUUID()]),
  );
  const animations = selectedAnimations.map((animation, index) => ({
    ...animation,
    id: animationMap.get(animation.id),
    name: idleName && index === 0 ? 'Idle' : animation.name,
  }));
  const frames = source.frames
    .filter((frame) => animationIds.includes(frame.animationId))
    .map((frame) => ({
      id: keepProjectId ? frame.id : randomUUID(),
      animationId: animationMap.get(frame.animationId),
      cels: Object.fromEntries(
        selectedLayers.map((layer) => [layerMap.get(layer.id), [...frame.cels[layer.id]]]),
      ),
    }));
  const activeAnimationId = animationMap.get(source.activeAnimationId) ?? animations[0]?.id;
  const activeFrameId =
    (keepProjectId ? frames.find((frame) => frame.id === source.activeFrameId)?.id : undefined) ??
    frames.find((frame) => frame.animationId === activeAnimationId)?.id;
  return projectSchema.parse({
    ...structuredClone(source),
    id: keepProjectId ? source.id : randomUUID(),
    name,
    layers: selectedLayers.map((layer) => ({ ...layer, id: layerMap.get(layer.id), visible: true })),
    animations,
    frames,
    activeLayerId: layerMap.get(source.activeLayerId) ?? layerMap.get(selectedLayers[0]?.id),
    activeAnimationId,
    activeFrameId,
    fps: animations.find((animation) => animation.id === activeAnimationId)?.fps,
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { Store } from '../src/store.js';
import { createProject, projectSchema } from '../src/model.js';
import { animationFrames } from '../shared/animations.js';
import { renderPNG, sheetMetadata } from '../src/png.js';

test('legacy projects migrate to Idle while preserving pixels and frame/layer IDs', () => {
  const project = createProject('Forest familiar', 2, 2);
  project.frames[0].cels[project.activeLayerId][0] = '#abcdef';
  delete project.animations;
  delete project.activeAnimationId;
  for (const frame of project.frames) delete frame.animationId;
  const restored = projectSchema.parse(project);
  assert.equal(restored.animations[0].name, 'Idle');
  assert.equal(restored.activeFrameId, project.activeFrameId);
  assert.equal(restored.activeLayerId, project.activeLayerId);
  assert.equal(restored.frames[0].cels[project.activeLayerId][0], '#abcdef');
  assert.equal(restored.frames[0].animationId, restored.activeAnimationId);
});

test('animation groups isolate frames and FPS, duplicate independently, and share layers', () => {
  const store = new Store();
  const idle = store.project.activeAnimationId;
  store.apply([
    { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#ff0000' }] },
    { type: 'settings', fps: 6 },
  ]);
  store.apply([
    { type: 'add_animation', name: 'Run', duplicate: true },
    { type: 'settings', fps: 12 },
  ]);
  const run = store.project.activeAnimationId;
  assert.notEqual(run, idle);
  store.apply([
    { type: 'clear' },
    { type: 'add_frame', duplicate: true },
    { type: 'add_layer', name: 'Highlights' },
  ]);
  assert.equal(animationFrames(store.project, idle).length, 1);
  assert.equal(animationFrames(store.project, run).length, 2);
  for (const frame of store.project.frames) assert.equal(Object.keys(frame.cels).length, 2);
  store.apply([{ type: 'select', animationId: idle }]);
  assert.equal(store.project.fps, 6);
  assert.equal(animationFrames(store.project)[0].cels[store.project.layers[0].id][0], '#ff0000');
  store.apply([{ type: 'select', animationId: run }]);
  assert.equal(store.project.fps, 12);
  assert.equal(animationFrames(store.project)[0].cels[store.project.layers[0].id][0], null);
  projectSchema.parse(store.project);
});

test('renaming, deleting, undo, and validation keep groups and selections consistent', () => {
  const store = new Store();
  const idle = store.project.activeAnimationId;
  store.apply([{ type: 'add_animation', name: 'Run' }]);
  const run = store.project.activeAnimationId;
  const before = JSON.stringify(store.project);
  assert.throws(
    () => store.apply([{ type: 'update_animation', animationId: run, name: 'IDLE!' }]),
    /distinct/,
  );
  assert.equal(JSON.stringify(store.project), before);
  assert.throws(
    () => store.apply([{ type: 'select', animationId: idle, frameId: store.project.activeFrameId }]),
    /belong/,
  );
  assert.throws(
    () => store.apply([{ type: 'delete_frame', frameId: store.project.activeFrameId }]),
    /at least one frame/,
  );
  store.apply([
    { type: 'update_animation', animationId: idle, name: 'Standing' },
    { type: 'delete_animation', animationId: run },
  ]);
  assert.equal(store.project.activeAnimationId, idle);
  assert.equal(store.project.animations[0].name, 'Standing');
  store.history('undo');
  assert.equal(store.project.activeAnimationId, run);
  assert.equal(store.project.animations[0].name, 'Idle');
  const invalid = structuredClone(store.project);
  invalid.frames[0].animationId = 'missing';
  assert.throws(() => projectSchema.parse(invalid), /animation/);
});

test('export contains only the requested animation with matching name, pixels, scale, and timing', () => {
  const store = new Store();
  store.apply([
    { type: 'new_project', name: 'Forest familiar', width: 2, height: 2 },
    { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#ff0000' }] },
  ]);
  const idle = store.project.activeAnimationId;
  store.apply([
    { type: 'add_animation', name: 'Run' },
    { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#0000ff' }] },
    { type: 'add_frame', duplicate: true },
    { type: 'settings', fps: 20 },
  ]);
  const idlePNG = PNG.sync.read(renderPNG(store.project, { animationId: idle, sheet: true }));
  assert.equal(idlePNG.width, 2);
  assert.deepEqual([...idlePNG.data.slice(0, 4)], [255, 0, 0, 255]);
  const runPNG = PNG.sync.read(renderPNG(store.project, { sheet: true, scale: 2 }));
  assert.equal(runPNG.width, 8);
  assert.deepEqual([...runPNG.data.slice(0, 4)], [0, 0, 255, 255]);
  const run = sheetMetadata(store.project, { scale: 2 });
  assert.equal(run.image, 'forest-familiar-run.png');
  assert.equal(run.animation.name, 'Run');
  assert.equal(run.frames.length, 2);
  assert.equal(run.frames[1].x, 4);
  assert.equal(run.frames[0].duration, 50);
  assert.equal(sheetMetadata(store.project, { animationId: idle }).image, 'forest-familiar-idle.png');
  assert.throws(
    () => renderPNG(store.project, { animationId: idle, frameId: store.project.activeFrameId }),
    /belong/,
  );
});

test('starting a new character saves both projects and reopening works after restart', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pixel-forge-library-'));
  try {
    const file = path.join(root, 'autosave.pixel.json');
    const store = new Store(file);
    store.apply([
      { type: 'settings', name: 'First character' },
      { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#123456' }] },
    ]);
    const first = structuredClone(store.project);
    store.apply([{ type: 'new_project', name: 'Second character', width: 16, height: 16 }], 'MCP');
    const restarted = new Store(file);
    assert.equal(restarted.project.name, 'Second character');
    assert.equal(restarted.listProjects().length, 2);
    restarted.openProject(first.id, restarted.project.id);
    assert.equal(restarted.project.name, 'First character');
    assert.equal(restarted.project.frames[0].cels[first.activeLayerId][0], '#123456');
    assert.equal(JSON.parse(readFileSync(file)).id, first.id);
    assert.throws(() => restarted.openProject(first.id, 'stale'), /project changed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

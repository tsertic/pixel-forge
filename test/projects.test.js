import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';

const create = (store, name, actor = 'You') => {
  store.apply([{ type: 'new_project', name, width: 8, height: 8 }], actor);
  return store.project.id;
};
const paint = (store, color) => store.apply([{ type: 'pixels', pixels: [{ x: 0, y: 0, color }] }]);
const firstPixel = (store) =>
  store.project.frames.find((frame) => frame.id === store.project.activeFrameId).cels[
    store.project.activeLayerId
  ][0];

test('human and MCP projects get separate tabs, and switching restores animation/frame selections', () => {
  const store = new Store();
  store.apply([
    { type: 'settings', name: 'Fox' },
    { type: 'add_animation', name: 'Run' },
    { type: 'add_frame', duplicate: true },
  ]);
  const fox = structuredClone(store.project);
  const dog = create(store, 'Dog', 'MCP');
  assert.deepEqual(
    store.snapshot().projectTabs.map((item) => item.name),
    ['Fox', 'Dog'],
  );
  store.openProject(fox.id, dog);
  assert.equal(store.project.activeAnimationId, fox.activeAnimationId);
  assert.equal(store.project.activeFrameId, fox.activeFrameId);
  assert.equal(store.snapshot().projectTabs.filter((item) => item.active)[0].id, fox.id);
  store.apply([{ type: 'settings', name: 'Fox ranger' }]);
  assert.deepEqual(
    store.snapshot().projectTabs.map((item) => item.name),
    ['Fox ranger', 'Dog'],
  );
  store.openProject(fox.id, fox.id);
  assert.equal(store.snapshot().projectTabs.length, 2);
});

test('Undo and Redo belong to each project and do not undo tab navigation', () => {
  const store = new Store();
  const first = store.project.id;
  paint(store, '#ff0000');
  const second = create(store, 'Second');
  assert.equal(store.snapshot().canUndo, false);
  paint(store, '#0000ff');
  store.openProject(first);
  store.history('undo');
  assert.equal(store.project.id, first);
  assert.equal(firstPixel(store), null);
  store.openProject(second);
  assert.equal(firstPixel(store), '#0000ff');
  store.history('undo');
  assert.equal(store.project.id, second);
  assert.equal(firstPixel(store), null);
  store.openProject(first);
  store.history('redo');
  assert.equal(firstPixel(store), '#ff0000');
  store.openProject(second);
  store.history('redo');
  assert.equal(firstPixel(store), '#0000ff');
  assert.equal(store.snapshot().projectTabs.length, 2);
});

test('a batch starting a character can undo its drawing inside the new tab', () => {
  const store = new Store();
  const previous = store.project.id;
  store.apply(
    [
      { type: 'new_project', name: 'New character', width: 8, height: 8 },
      { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#abcdef' }] },
    ],
    'MCP',
  );
  const character = store.project.id;
  store.history('undo');
  assert.equal(store.project.id, character);
  assert.equal(firstPixel(store), null);
  assert.ok(store.snapshot().projectTabs.some((item) => item.id === previous));
  store.history('redo');
  assert.equal(firstPixel(store), '#abcdef');
});

test('closing tabs keeps saved artwork, selects a neighbor, and cannot close the last tab', () => {
  const store = new Store();
  const first = store.project.id;
  const second = create(store, 'Second');
  paint(store, '#abcdef');
  const third = create(store, 'Third');
  store.closeProjectTab(second, third);
  assert.equal(store.project.id, third);
  assert.deepEqual(
    store.snapshot().projectTabs.map((item) => item.id),
    [first, third],
  );
  store.closeProjectTab(third, third);
  assert.equal(store.project.id, first);
  assert.throws(() => store.closeProjectTab(first, first), /at least one/);
  assert.ok(store.listProjects().some((item) => item.id === second));
  store.openProject(second, first);
  assert.equal(firstPixel(store), '#abcdef');
  assert.deepEqual(
    store.snapshot().projectTabs.map((item) => item.id),
    [first, second],
  );
  const before = JSON.stringify(store.snapshot());
  assert.throws(() => store.closeProjectTab(first, 'stale'), /project changed/);
  assert.equal(JSON.stringify(store.snapshot()), before);
});

test('tab order, names, active project, and closed tabs survive a restart', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pixel-forge-tabs-'));
  try {
    const file = path.join(root, 'autosave.pixel.json');
    const store = new Store(file);
    store.apply([{ type: 'settings', name: 'First' }]);
    const first = store.project.id;
    const second = create(store, 'Second');
    const third = create(store, 'Third');
    store.closeProjectTab(second);
    let restored = new Store(file);
    assert.equal(restored.project.id, third);
    assert.deepEqual(
      restored.snapshot().projectTabs.map((item) => item.name),
      ['First', 'Third'],
    );
    restored.openProject(second);
    assert.equal(restored.snapshot().projectTabs.at(-1).id, second);
    const workspaceFile = path.join(root, 'workspace.json');
    const workspace = JSON.parse(readFileSync(workspaceFile));
    writeFileSync(
      workspaceFile,
      JSON.stringify({ ...workspace, projectIds: [first, 'missing-project', first, third, second] }),
    );
    restored = new Store(file);
    assert.deepEqual(
      restored.snapshot().projectTabs.map((item) => item.id),
      [first, third, second],
    );
    assert.equal(restored.project.id, second);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failed archive leaves the active tab, pixels, and history unchanged', () => {
  const store = new Store();
  paint(store, '#123456');
  const before = JSON.stringify(store.snapshot());
  store.library.save = () => {
    throw new Error('Disk unavailable');
  };
  assert.throws(() => create(store, 'Cannot save'), /Disk unavailable/);
  assert.equal(JSON.stringify(store.snapshot()), before);
});

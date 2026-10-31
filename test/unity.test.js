import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Store } from '../src/store.js';
import { UnitySync, validateUnityFolder, validateExportFolder } from '../src/unity-sync.js';
import { createApp } from '../src/server.js';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'pixel-forge-unity-'));
  const project = path.join(root, 'Unity Project With Spaces'),
    folder = path.join(project, 'Assets', 'Sprites');
  mkdirSync(folder, { recursive: true });
  mkdirSync(path.join(project, 'ProjectSettings'));
  writeFileSync(path.join(project, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.5.10f1');
  const store = new Store(),
    sync = new UnitySync(store, { file: path.join(root, 'unity-sync.json'), delay: 5 });
  const settings = { enabled: true, folder, fileName: 'dog', pixelsPerUnit: 32, installImporter: true };
  return {
    root,
    folder,
    store,
    sync,
    settings,
    png: path.join(folder, 'dog-idle.png'),
    cleanup() {
      sync.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 30));

test('automatic export separates Idle and Run filenames and preserves prior animation output', () => {
  const f = fixture();
  try {
    f.sync.configure({ ...f.settings, fileName: 'forest-familiar' });
    const idlePath = path.join(f.folder, 'forest-familiar-idle.png');
    const idle = readFileSync(idlePath);
    f.store.apply([
      { type: 'add_animation', name: 'Run' },
      { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#ff0000' }] },
    ]);
    const result = f.sync.flush();
    assert.equal(result.lastExport.path, path.join(f.folder, 'forest-familiar-run.png'));
    assert.ok(idle.equals(readFileSync(idlePath)));
    const marker = JSON.parse(readFileSync(path.join(f.folder, 'forest-familiar-run.pixelforge.json')));
    assert.equal(marker.animationName, 'Run');
    assert.equal(marker.animationId, f.store.project.activeAnimationId);
  } finally {
    f.cleanup();
  }
});

test('main destination follows projects, survives restart, and keeps filenames separate', () => {
  const f = fixture();
  let restarted;
  try {
    f.sync.configure({ ...f.settings, useAsMainFolder: true });
    const first = structuredClone(f.store.project);
    f.store.apply([{ type: 'new_project', name: 'Another dog', width: 16, height: 16 }]);
    const inherited = f.sync.snapshot();
    assert.equal(inherited.folder, f.folder);
    assert.equal(inherited.useAsMainFolder, true);
    assert.equal(inherited.enabled, false);
    assert.notEqual(inherited.fileName, 'dog');
    f.sync.configure({ ...inherited, enabled: true });
    assert.ok(existsSync(path.join(f.folder, inherited.fileName + '-idle.png')));
    assert.throws(
      () => f.sync.configure({ ...inherited, enabled: true, fileName: 'dog' }),
      /Another Pixel Forge project/,
    );
    const second = structuredClone(f.store.project);
    const otherFolder = path.join(f.folder, 'Main destination');
    mkdirSync(otherFolder);
    f.sync.configure({ ...inherited, enabled: true, folder: otherFolder, useAsMainFolder: true });
    f.store.replace(first);
    assert.equal(f.sync.snapshot().folder, otherFolder);
    assert.equal(f.sync.snapshot().fileName, 'dog');
    assert.equal(f.sync.snapshot().enabled, true);
    f.sync.close();
    restarted = new UnitySync(f.store, { file: path.join(f.root, 'unity-sync.json') });
    assert.equal(restarted.snapshot().folder, otherFolder);
    assert.equal(restarted.snapshot().useAsMainFolder, true);
    f.store.replace(second);
    assert.equal(restarted.snapshot().fileName, inherited.fileName);
    assert.equal(restarted.snapshot().folder, otherFolder);
  } finally {
    restarted?.close();
    f.cleanup();
  }
});

test('an unchecked project keeps its own destination when the main folder changes', () => {
  const f = fixture();
  try {
    f.sync.configure({ ...f.settings, useAsMainFolder: true });
    const first = structuredClone(f.store.project);
    f.store.apply([{ type: 'new_project', name: 'Unreal asset', width: 16, height: 16 }]);
    f.sync.configure({
      ...f.settings,
      engine: 'unreal',
      folder: f.root,
      fileName: 'cat',
      useAsMainFolder: false,
    });
    const separate = structuredClone(f.store.project);
    f.store.replace(first);
    const newMain = path.join(f.folder, 'New Main');
    mkdirSync(newMain);
    f.sync.configure({ ...f.settings, folder: newMain, useAsMainFolder: true });
    f.store.replace(separate);
    assert.equal(f.sync.snapshot().folder, f.root);
    assert.equal(f.sync.snapshot().engine, 'unreal');
    assert.equal(f.sync.snapshot().useAsMainFolder, false);
    assert.equal(f.sync.snapshot().mainFolder.folder, newMain);
  } finally {
    f.cleanup();
  }
});

test('v2 settings migrate without silently opting projects into a main folder', () => {
  const f = fixture();
  let migrated;
  try {
    f.sync.close();
    const file = path.join(f.root, 'unity-sync.json');
    writeFileSync(file, JSON.stringify({ version: 2, projects: { [f.store.project.id]: f.settings } }));
    migrated = new UnitySync(f.store, { file });
    assert.equal(migrated.snapshot().folder, f.folder);
    assert.equal(migrated.snapshot().enabled, true);
    assert.equal(migrated.snapshot().useAsMainFolder, false);
    const saved = JSON.parse(readFileSync(file));
    assert.equal(saved.version, 3);
    assert.equal(saved.mainFolder, null);
    migrated.configure({ ...f.settings, useAsMainFolder: true });
    assert.equal(JSON.parse(readFileSync(file)).mainFolder.folder, f.folder);
  } finally {
    migrated?.close();
    f.cleanup();
  }
});

test('Unity sync exports transparent pixels after both human and MCP edits, undo and redo', async () => {
  const f = fixture();
  try {
    f.sync.configure(f.settings);
    assert.equal(PNG.sync.read(readFileSync(f.png)).data[3], 0);
    f.store.apply([{ type: 'pixels', pixels: [{ x: 0, y: 0, color: '#ff9900' }] }], 'MCP');
    await pause();
    assert.deepEqual([...PNG.sync.read(readFileSync(f.png)).data.slice(0, 4)], [255, 153, 0, 255]);
    writeFileSync(f.png + '.meta', 'guid: preserve-this-guid');
    f.store.history('undo');
    await pause();
    assert.equal(PNG.sync.read(readFileSync(f.png)).data[3], 0);
    f.store.history('redo');
    await pause();
    assert.equal(PNG.sync.read(readFileSync(f.png)).data[3], 255);
    assert.equal(readFileSync(f.png + '.meta', 'utf8'), 'guid: preserve-this-guid');
    assert.equal(f.sync.snapshot().error, null);
  } finally {
    f.cleanup();
  }
});

test('unchanged canvas does not rewrite PNG; PPU changes update marker and trigger import', () => {
  const f = fixture();
  try {
    f.sync.configure(f.settings);
    const initial = statSync(f.png).mtimeMs;
    f.sync.flush();
    assert.equal(f.sync.snapshot().lastExport.changed, false);
    assert.equal(statSync(f.png).mtimeMs, initial);
    f.sync.configure({ ...f.settings, pixelsPerUnit: 16 });
    assert.equal(JSON.parse(readFileSync(path.join(f.folder, 'dog-idle.pixelforge.json'))).pixelsPerUnit, 16);
    assert.equal(f.sync.snapshot().lastExport.changed, true);
  } finally {
    f.cleanup();
  }
});

test('Unity sync settings survive restart and can be disabled without deleting exports', async () => {
  const f = fixture();
  let restored;
  try {
    f.sync.configure(f.settings);
    f.sync.close();
    restored = new UnitySync(f.store, { file: path.join(f.root, 'unity-sync.json'), delay: 5 });
    assert.equal(restored.snapshot().folder, f.folder);
    assert.equal(restored.snapshot().enabled, true);
    restored.configure({ ...f.settings, enabled: false });
    const before = readFileSync(f.png);
    f.store.apply([{ type: 'pixels', pixels: [{ x: 1, y: 1, color: '#ff0000' }] }]);
    await pause();
    assert.ok(before.equals(readFileSync(f.png)));
  } finally {
    restored?.close();
    f.cleanup();
  }
});

test('sync rejects paths outside Unity Assets and path traversal filenames', () => {
  const f = fixture();
  try {
    assert.throws(() => validateUnityFolder(f.root), /not inside/);
    assert.throws(() => f.sync.configure({ ...f.settings, fileName: '../White' }));
    assert.throws(() => f.sync.configure({ ...f.settings, fileName: 'CON' }));
    assert.equal(existsSync(f.png), false);
  } finally {
    f.cleanup();
  }
});

test('sync refuses to overwrite an unmanaged image or a custom importer', () => {
  const f = fixture();
  try {
    writeFileSync(f.png, 'original artwork');
    assert.throws(() => f.sync.configure(f.settings), /already exists/);
    assert.equal(readFileSync(f.png, 'utf8'), 'original artwork');
    mkdirSync(path.join(f.folder, 'Editor'));
    writeFileSync(path.join(f.folder, 'Editor', 'PixelForgeSpriteImporter.cs'), 'custom importer');
    assert.throws(() => f.sync.configure({ ...f.settings, fileName: 'cat' }), /custom/);
  } finally {
    f.cleanup();
  }
});

test('generated importer namespaces avoid duplicate class names across sync folders', () => {
  const f = fixture();
  try {
    f.sync.configure(f.settings);
    const other = path.join(f.folder, 'Other');
    mkdirSync(other);
    f.sync.configure({ ...f.settings, folder: other });
    const a = readFileSync(path.join(f.folder, 'Editor', 'PixelForgeSpriteImporter.cs'), 'utf8');
    const b = readFileSync(path.join(other, 'Editor', 'PixelForgeSpriteImporter.cs'), 'utf8');
    assert.notEqual(a.match(/namespace (\w+)/)[1], b.match(/namespace (\w+)/)[1]);
    assert.match(a, /FilterMode.Point/);
    assert.match(a, /TextureImporterCompression.Uncompressed/);
  } finally {
    f.cleanup();
  }
});

test('Unity sync HTTP configuration and real MCP drawing update the exported asset', async () => {
  const f = fixture(),
    instance = createApp({ store: f.store });
  f.sync.close();
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`,
    client = new Client({ name: 'unity-sync-test', version: '1.0.0' });
  try {
    const response = await fetch(origin + '/api/unity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f.settings),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).error, null);
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp')));
    const result = await client.callTool({
      name: 'pixel_draw',
      arguments: { operations: [{ type: 'pixels', pixels: [{ x: 0, y: 0, color: '#123456' }] }] },
    });
    assert.ok(!result.isError);
    // Explicit flush tests the exact same pending export without timing assumptions.
    await fetch(origin + '/api/unity/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.deepEqual([...PNG.sync.read(readFileSync(f.png)).data.slice(0, 4)], [18, 52, 86, 255]);
    const state = await (await fetch(origin + '/api/state')).json();
    assert.equal(state.unity.lastExport.path, f.png);
  } finally {
    await client.close();
    instance.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    f.cleanup();
  }
});

test('a new project starts with export off and reopening restores its own Unity or Unreal destination', async () => {
  const f = fixture();
  try {
    f.sync.configure(f.settings);
    const first = structuredClone(f.store.project),
      before = readFileSync(f.png);
    f.store.apply([{ type: 'new_project', name: 'Separate asset', width: 16, height: 16 }]);
    assert.equal(f.sync.snapshot().enabled, false);
    f.store.apply([{ type: 'pixels', pixels: [{ x: 0, y: 0, color: '#ee44aa' }] }]);
    await pause();
    assert.ok(before.equals(readFileSync(f.png)));
    const folder = path.join(f.root, 'Unreal Source');
    mkdirSync(folder);
    f.sync.configure({ ...f.settings, engine: 'unreal', folder, fileName: 'cat' });
    const second = structuredClone(f.store.project);
    assert.equal(existsSync(path.join(folder, 'Editor')), false);
    f.store.replace(first);
    assert.equal(f.sync.snapshot().engine, 'unity');
    assert.equal(f.sync.snapshot().folder, f.folder);
    f.store.replace(second);
    assert.equal(f.sync.snapshot().engine, 'unreal');
    assert.equal(f.sync.snapshot().fileName, 'cat');
    assert.equal(JSON.parse(readFileSync(path.join(folder, 'cat-idle.pixelforge.json'))).engine, 'unreal');
    const saved = JSON.parse(readFileSync(path.join(f.root, 'unity-sync.json')));
    assert.equal(saved.version, 3);
    assert.equal(Object.keys(saved.projects).length, 2);
  } finally {
    f.cleanup();
  }
});

test('legacy global Unity settings migrate once and never attach themselves to a new project after restart', () => {
  const f = fixture();
  let migrated, restarted;
  try {
    f.sync.close();
    const file = path.join(f.root, 'legacy.json');
    writeFileSync(file, JSON.stringify(f.settings));
    const oldId = f.store.project.id;
    migrated = new UnitySync(f.store, { file });
    assert.equal(migrated.snapshot().enabled, true);
    assert.equal(JSON.parse(readFileSync(file)).projects[oldId].engine, 'unity');
    f.store.apply([{ type: 'new_project', name: 'Other', width: 8, height: 8 }]);
    migrated.close();
    restarted = new UnitySync(f.store, { file });
    assert.equal(restarted.snapshot().enabled, false);
    assert.equal(restarted.snapshot().folder, '');
  } finally {
    migrated?.close();
    restarted?.close();
    f.cleanup();
  }
});

test('Unreal accepts an existing source folder while stale project info cannot change another project', () => {
  const f = fixture();
  try {
    assert.equal(validateExportFolder(f.root, 'unreal'), f.root);
    assert.throws(() => validateExportFolder(path.join(f.root, 'missing'), 'unreal'));
    assert.throws(() => f.sync.configure({ ...f.settings, projectId: 'old-project' }), /project changed/);
    assert.equal(f.sync.snapshot().enabled, false);
  } finally {
    f.cleanup();
  }
});

test('Project info HTTP API supports Unreal and validates folder picker requests without opening native UI', async () => {
  const f = fixture();
  f.sync.close();
  const picked = [],
    instance = createApp({
      store: f.store,
      folderPicker: async (initial) => {
        picked.push(initial);
        return f.root;
      },
    });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body) =>
    fetch(origin + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const picker = await (await post('/api/folders/pick', { initial: 'C:\\Some folder' })).json();
    assert.equal(picker.folder, f.root);
    assert.deepEqual(picked, ['C:\\Some folder']);
    assert.equal((await post('/api/folders/pick', { initial: 123 })).status, 400);
    const response = await post('/api/project-info', {
      ...f.settings,
      projectId: f.store.project.id,
      name: 'New title',
      engine: 'unreal',
      folder: f.root,
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).engine, 'unreal');
    assert.equal(f.store.project.name, 'New title');
    assert.ok(existsSync(path.join(f.root, 'dog-idle.png')));
    assert.equal(existsSync(path.join(f.root, 'Editor')), false);
    const stale = await post('/api/project-info', { ...f.settings, projectId: 'stale', name: 'Wrong title' });
    assert.equal(stale.status, 400);
    assert.equal(f.store.project.name, 'New title');
  } finally {
    instance.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    f.cleanup();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/server.js';
import { Store } from '../src/store.js';
import { extractCharacter } from '../src/project/extract-character.js';

test('real MCP rejects undeclared or mismatched characters and creates Wizard in its own tab', async () => {
  const store = new Store();
  store.apply([
    { type: 'settings', name: 'Skeleton' },
    { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#abcdef' }] },
  ]);
  const skeleton = structuredClone(store.project);
  const instance = createApp({ store });
  const http = instance.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => http.once('listening', resolve));
  const client = new Client({ name: 'character-workflow-test', version: '1.0.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${http.address().port}/mcp`)),
    );
    const before = JSON.stringify(store.snapshot());
    const undeclared = await client.callTool({
      name: 'pixel_draw',
      arguments: { operations: [{ type: 'add_layer', name: 'Wizard' }] },
    });
    assert.equal(undeclared.isError, true);
    const mismatch = await client.callTool({
      name: 'pixel_draw',
      arguments: {
        projectId: skeleton.id,
        intent: 'edit_character',
        characterName: 'Wizard',
        operations: [{ type: 'add_layer', name: 'Wizard' }],
      },
    });
    assert.equal(mismatch.isError, true);
    assert.match(mismatch.content[0].text, /pixel_create_character/);
    const newLayer = await client.callTool({
      name: 'pixel_draw',
      arguments: {
        projectId: skeleton.id,
        intent: 'new_character',
        characterName: 'Wizard',
        operations: [{ type: 'add_animation', name: 'Wizard Idle' }],
      },
    });
    assert.equal(newLayer.isError, true);
    const paintOther = await client.callTool({
      name: 'pixel_paint_sprite',
      arguments: {
        projectId: skeleton.id,
        intent: 'edit_character',
        characterName: 'Wizard',
        rows: ['x'],
        colors: { x: '#ffffff' },
      },
    });
    assert.equal(paintOther.isError, true);
    assert.equal(JSON.stringify(store.snapshot()), before);
    const created = await client.callTool({
      name: 'pixel_create_character',
      arguments: { name: 'Wizard', expectedProjectId: skeleton.id, width: 32, height: 32 },
    });
    assert.ok(!created.isError);
    const wizard = JSON.parse(created.content[0].text).project;
    assert.notEqual(wizard.id, skeleton.id);
    assert.equal(wizard.name, 'Wizard');
    assert.equal(wizard.animations[0].name, 'Idle');
    assert.deepEqual(
      store.snapshot().projectTabs.map((tab) => tab.name),
      ['Skeleton', 'Wizard'],
    );
    const paint = await client.callTool({
      name: 'pixel_paint_sprite',
      arguments: {
        projectId: wizard.id,
        intent: 'edit_character',
        characterName: 'Wizard',
        rows: ['x'],
        colors: { x: '#8800ff' },
      },
    });
    assert.ok(!paint.isError);
    assert.equal(store.project.frames[0].cels[store.project.activeLayerId][0], '#8800ff');
    assert.deepEqual(store.library.read(skeleton.id), skeleton);
    const animation = await client.callTool({
      name: 'pixel_draw',
      arguments: {
        projectId: wizard.id,
        intent: 'edit_character',
        characterName: 'Wizard',
        operations: [{ type: 'add_animation', name: 'Run' }],
      },
    });
    assert.ok(!animation.isError);
    assert.equal(store.project.id, wizard.id);
    assert.equal(store.project.animations.length, 2);
    const stale = await client.callTool({
      name: 'pixel_draw',
      arguments: {
        projectId: skeleton.id,
        intent: 'edit_character',
        characterName: 'Wizard',
        operations: [{ type: 'clear' }],
      },
    });
    assert.equal(stale.isError, true);
    const incorrectBatch = await client.callTool({
      name: 'pixel_draw',
      arguments: {
        projectId: wizard.id,
        intent: 'new_character',
        characterName: 'Wizard',
        operations: [{ type: 'new_project', name: 'Knight', width: 16, height: 16 }],
      },
    });
    assert.equal(incorrectBatch.isError, true);
    assert.equal(store.project.id, wizard.id);
  } finally {
    await client.close();
    instance.close();
    http.closeAllConnections();
    await new Promise((resolve) => http.close(resolve));
  }
});

test('character extraction preserves all requested cels, separates IDs, and leaves its source intact', () => {
  const store = new Store();
  store.apply([
    { type: 'settings', name: 'Mixed characters' },
    { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#ffffff' }] },
  ]);
  const skeletonLayer = store.project.activeLayerId;
  const skeletonAnimation = store.project.activeAnimationId;
  store.apply([
    { type: 'add_layer', name: 'Wizard' },
    { type: 'add_animation', name: 'Wizard Idle' },
    { type: 'pixels', pixels: [{ x: 1, y: 1, color: '#8800ff' }] },
  ]);
  const wizardLayer = store.project.activeLayerId;
  const wizardAnimation = store.project.activeAnimationId;
  const before = JSON.stringify(store.project);
  const wizard = extractCharacter(store.project, {
    name: 'Wizard',
    layerIds: [wizardLayer],
    animationIds: [wizardAnimation],
    idleName: true,
  });
  const skeleton = extractCharacter(store.project, {
    name: 'Skeleton',
    layerIds: [skeletonLayer],
    animationIds: [skeletonAnimation],
    keepProjectId: true,
  });
  assert.equal(JSON.stringify(store.project), before);
  assert.equal(skeleton.id, store.project.id);
  assert.equal(skeleton.frames[0].cels[skeleton.activeLayerId][0], '#ffffff');
  assert.notEqual(wizard.id, store.project.id);
  assert.notEqual(wizard.layers[0].id, wizardLayer);
  assert.notEqual(wizard.animations[0].id, wizardAnimation);
  assert.equal(wizard.animations[0].name, 'Idle');
  assert.equal(wizard.frames[0].cels[wizard.activeLayerId][33], '#8800ff');
  wizard.frames[0].cels[wizard.activeLayerId][33] = null;
  assert.equal(JSON.stringify(store.project), before);
  assert.throws(
    () =>
      extractCharacter(store.project, {
        name: 'Bad',
        layerIds: ['missing'],
        animationIds: [wizardAnimation],
      }),
    /unknown/,
  );
});

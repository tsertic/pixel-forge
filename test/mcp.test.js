import { callWithCharacter } from './helpers/mcp-client.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { PNG } from 'pngjs';
import { createApp } from '../src/server.js';
import { Store } from '../src/store.js';

test('real MCP HTTP client edits the live SSE canvas, returns images, and shares history with UI', async () => {
  const instance = createApp({ store: new Store() }),
    http = instance.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const url = `http://127.0.0.1:${http.address().port}`,
    client = new Client({ name: 'integration-test', version: '1.0.0' }),
    abort = new AbortController();
  let reader;
  try {
    const stream = await fetch(url + '/api/events', { signal: abort.signal });
    reader = stream.body.getReader();
    const initial = await reader.read();
    assert.match(new TextDecoder().decode(initial.value), /data:/);
    await client.connect(new StreamableHTTPClientTransport(new URL(url + '/mcp')));
    const list = await client.listTools();
    assert.equal(list.tools.length, 8);
    assert.ok(list.tools.some((t) => t.name === 'pixel_paint_sprite'));
    const result = await callWithCharacter(client, instance.store, {
        name: 'pixel_get_project',
        arguments: {},
      }),
      project = JSON.parse(result.content[0].text);
    const edit = await callWithCharacter(client, instance.store, {
      name: 'pixel_paint_sprite',
      arguments: {
        projectId: project.id,
        rows: ['.aa.', 'abba'],
        colors: { a: '#ff9900', b: '#ffffff' },
        x: 1,
        y: 1,
        label: 'MCP test sprite',
      },
    });
    assert.ok(!edit.isError);
    const latest = await (await fetch(url + '/api/state')).json();
    assert.equal(latest.project.frames[0].cels[project.activeLayerId][34], '#ff9900');
    assert.equal(latest.activity[0].actor, 'MCP');
    let live = '';
    for (let i = 0; i < 5 && !live.includes('MCP test sprite'); i++) {
      const event = await reader.read();
      live += new TextDecoder().decode(event.value);
    }
    assert.match(live, /MCP test sprite/);
    const preview = await callWithCharacter(client, instance.store, {
      name: 'pixel_get_preview',
      arguments: { scale: 4 },
    });
    assert.equal(preview.content[0].type, 'image');
    const png = PNG.sync.read(Buffer.from(preview.content[0].data, 'base64'));
    assert.equal(png.width, 128);
    assert.equal(png.data[3], 0);
    const invalid = await callWithCharacter(client, instance.store, {
      name: 'pixel_draw',
      arguments: { projectId: 'stale', operations: [{ type: 'clear' }] },
    });
    assert.equal(invalid.isError, true);
    const uiEdit = await fetch(url + '/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: [{ type: 'line', x1: 0, y1: 0, x2: 3, y2: 0, color: '#112233' }] }),
    });
    assert.equal(uiEdit.status, 200);
    await callWithCharacter(client, instance.store, {
      name: 'pixel_history',
      arguments: { direction: 'undo' },
    });
    const pixels = await callWithCharacter(client, instance.store, {
      name: 'pixel_get_pixels',
      arguments: { width: 4, height: 1 },
    });
    assert.deepEqual(JSON.parse(pixels.content[0].text).rows[0], [null, null, null, null]);
    const exportResponse = await fetch(url + '/api/export?sheet=true&scale=1');
    assert.equal(exportResponse.headers.get('content-type'), 'image/png');
    const hostile = await fetch(url + '/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ operations: [{ type: 'clear' }] }),
    });
    assert.equal(hostile.status, 403);
    const bad = await fetch(url + '/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(bad.status, 400);
    const idleId = instance.store.project.activeAnimationId;
    const grouped = await callWithCharacter(client, instance.store, {
      name: 'pixel_draw',
      arguments: {
        operations: [
          { type: 'add_animation', name: 'Run' },
          { type: 'add_frame', duplicate: true },
          { type: 'settings', fps: 12 },
        ],
      },
    });
    assert.ok(!grouped.isError);
    const groupedProject = JSON.parse(
      (await callWithCharacter(client, instance.store, { name: 'pixel_get_project', arguments: {} }))
        .content[0].text,
    );
    assert.equal(groupedProject.animations.length, 2);
    assert.equal(
      groupedProject.frames.filter((frame) => frame.animationId === groupedProject.activeAnimationId).length,
      2,
    );
    const groupExport = await callWithCharacter(client, instance.store, {
      name: 'pixel_export',
      arguments: { sheet: true, animationId: idleId },
    });
    assert.equal(PNG.sync.read(Buffer.from(groupExport.content[0].data, 'base64')).width, 32);
    assert.equal(JSON.parse(groupExport.content[1].text).image, 'untitled-sprite-idle.png');
    const metadataResponse = await fetch(url + '/api/sheet.json?animationId=' + idleId + '&scale=2');
    assert.match(metadataResponse.headers.get('content-disposition'), /untitled-sprite-idle.json/);
    assert.equal((await metadataResponse.json()).frames.length, 1);
    assert.equal((await fetch(url + '/api/export?projectId=stale')).status, 400);
    const newCharacter = await callWithCharacter(client, instance.store, {
      name: 'pixel_draw',
      arguments: {
        projectId: project.id,
        operations: [{ type: 'new_project', name: 'Fox ranger', width: 16, height: 16 }],
      },
    });
    assert.ok(!newCharacter.isError);
    assert.notEqual(instance.store.project.id, project.id);
    assert.equal(instance.store.snapshot().projectTabs.length, 2);
    assert.ok(instance.store.snapshot().projectTabs.some((tab) => tab.id === project.id));
    assert.equal(instance.store.project.animations[0].name, 'Idle');
    const library = await (await fetch(url + '/api/projects')).json();
    assert.ok(library.some((entry) => entry.id === project.id));
    const reopened = await fetch(url + '/api/projects/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: project.id, projectId: instance.store.project.id }),
    });
    assert.equal(reopened.status, 200);
    assert.equal(instance.store.project.animations.length, 2);
    const index = await fetch(url);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Pixel Forge/);
  } finally {
    await client.close();
    abort.abort();
    await reader?.cancel().catch(() => {});
    instance.close();
    http.closeAllConnections();
    await new Promise((r) => http.close(r));
  }
});

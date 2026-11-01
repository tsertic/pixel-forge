import { callWithCharacter } from './helpers/mcp-client.js';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/server.js';
import { Store } from '../src/store.js';

// Uses an isolated, in-memory project. Does not touch the running editor or autosave.
let pickedFolder = null;
const instance = createApp({ store: new Store(), folderPicker: async () => pickedFolder });
const http = instance.app.listen(0, '127.0.0.1');
await new Promise((resolve) => http.once('listening', resolve));
const origin = `http://127.0.0.1:${http.address().port}`;
const temp = mkdtempSync(path.join(tmpdir(), 'pixel-forge-browser-'));
const client = new Client({ name: 'browser-verification', version: '1.0.0' });
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PW_BROWSER ?? 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(),
    peer = await context.newPage();
  const errors = [];
  for (const tab of [page, peer]) tab.on('pageerror', (error) => errors.push(error.message));
  await Promise.all([page.goto(origin), peer.goto(origin)]);
  await page.bringToFront();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.locator('#connection').filter({ hasText: 'Live canvas' }).waitFor();
  const initialProjectId = instance.store.project.id;

  const pixel = async (tab, x, y, rgba) =>
    tab.waitForFunction(
      ({ x, y, rgba }) => {
        const canvas = document.querySelector('#art');
        const data = [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
        return data.join(',') === rgba.join(',');
      },
      { x, y, rgba },
      { polling: 50 },
    );
  const paint = async (x1, y1, x2 = x1, y2 = y1, button = 'left') => {
    const box = await page.locator('#interaction').boundingBox();
    const width = await page.locator('#interaction').getAttribute('width');
    const z = box.width / Number(width);
    await page.mouse.move(box.x + (x1 + 0.5) * z, box.y + (y1 + 0.5) * z);
    await page.mouse.down({ button });
    await page.mouse.move(box.x + (x2 + 0.5) * z, box.y + (y2 + 0.5) * z, { steps: 8 });
    await page.mouse.up({ button });
  };
  const chooseColor = async (hex) => {
    await page.locator('#hex').fill(hex);
    await page.locator('#hex').press('Tab');
  };
  await page.locator('#newProjectTab').click();
  await page.locator('#newName').fill('Browser verification');
  await page.locator('[data-size="16"]').click();
  await page.locator('#newForm button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('#art').width === 16);
  await page
    .locator('#projectTabs')
    .getByRole('tab', { name: 'Browser verification', exact: true })
    .waitFor();
  assert.equal(await page.locator('#projectTabs [role="tab"]').count(), 2);
  await peer.waitForFunction(() => document.querySelectorAll('#projectTabs [role="tab"]').length === 2);
  assert.ok(await page.locator(`[data-project-tab="${initialProjectId}"]`).count());
  await chooseColor('ff0000');
  await chooseColor('invalid');
  await page.locator('#toast').filter({ hasText: 'Enter 6 or 8' }).waitFor();
  assert.equal(await page.locator('#hex').inputValue(), 'ff0000');
  await paint(1, 1, 6, 1);
  await pixel(page, 4, 1, [255, 0, 0, 255]);
  await pixel(peer, 4, 1, [255, 0, 0, 255]);
  await page.locator('#undo').click();
  await pixel(page, 4, 1, [0, 0, 0, 0]);
  await page.locator('#redo').click();
  await pixel(page, 4, 1, [255, 0, 0, 255]);
  await page.locator('#mirror').click();
  await paint(2, 3);
  await pixel(page, 13, 3, [255, 0, 0, 255]);
  await paint(2, 3, 2, 3, 'right');
  await pixel(page, 13, 3, [0, 0, 0, 0]);
  await page.locator('#mirror').click();
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await page.locator('#filled').uncheck();
  await paint(3, 4, 7, 8);
  await pixel(page, 3, 4, [255, 0, 0, 255]);
  await pixel(page, 5, 6, [0, 0, 0, 0]);
  await chooseColor('00ff00');
  await page.getByRole('button', { name: 'Fill', exact: true }).click();
  await paint(5, 6);
  await pixel(page, 5, 6, [0, 255, 0, 255]);
  console.log('PASS: pointer drawing, shapes, fill, symmetry, eraser, undo/redo, two live views');

  page.once('dialog', (dialog) => dialog.accept('Highlights'));
  await page.locator('#addLayer').click();
  await page.locator('.layer').filter({ hasText: 'Highlights' }).waitFor();
  await page.locator('#duplicateFrame').click();
  await page.waitForFunction(() => document.querySelectorAll('.frame-card').length === 2);
  await pixel(page, 5, 6, [0, 255, 0, 255]);
  await page.locator('#onion').click();
  await page.locator('#play').click();
  assert.equal(await page.locator('#play').textContent(), 'Ⅱ');
  await page.locator('#play').click();
  await page.locator('#fps').fill('12');
  await page.locator('#fps').press('Tab');
  await page.waitForFunction(async () => (await (await fetch('/api/state')).json()).project.fps === 12);
  console.log('PASS: layers, frame duplication, onion skin, playback and FPS');

  page.once('dialog', (dialog) => dialog.accept('Run'));
  await page.locator('#addAnimation').click();
  await page.getByRole('tab', { name: 'Run', exact: true }).waitFor();
  assert.equal(await page.locator('.frame-card').count(), 1);
  await pixel(page, 5, 6, [0, 0, 0, 0]);
  await page.getByRole('button', { name: 'Pencil', exact: true }).click();
  await chooseColor('0044ff');
  await paint(0, 0);
  await pixel(page, 0, 0, [0, 68, 255, 255]);
  await page.locator('#duplicateFrame').click();
  await page.waitForFunction(() => document.querySelectorAll('.frame-card').length === 2);
  await page.locator('#fps').fill('20');
  await page.locator('#fps').press('Tab');
  await page.waitForFunction(async () => (await (await fetch('/api/state')).json()).project.fps === 20);
  page.once('dialog', (dialog) => dialog.accept('Sprint'));
  await page.locator('#renameAnimation').click();
  await page.getByRole('tab', { name: 'Sprint', exact: true }).waitFor();
  await page.locator('#play').click();
  await pixel(page, 0, 0, [0, 68, 255, 255]);
  await page.locator('#play').click();
  await page.locator('#export').click();
  await page.locator('#exportKind').selectOption('sheet');
  const animationDownload = page.waitForEvent('download');
  await page.locator('#exportForm button[type="submit"]').click();
  const animationFile = await animationDownload;
  assert.equal(animationFile.suggestedFilename(), 'browser-verification-sprint.png');
  const animationPath = path.join(temp, animationFile.suggestedFilename());
  await animationFile.saveAs(animationPath);
  const animationPNG = PNG.sync.read(readFileSync(animationPath));
  assert.equal(animationPNG.width, 32);
  assert.deepEqual([...animationPNG.data.slice(0, 4)], [0, 68, 255, 255]);
  await page.getByRole('tab', { name: 'Idle', exact: true }).click();
  await pixel(page, 5, 6, [0, 255, 0, 255]);
  assert.equal(await page.locator('#fps').inputValue(), '12');
  console.log('PASS: animation groups, rename, isolated frames/onion skin/playback, FPS, named sprite sheet');

  await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp')));
  const p = instance.store.project;
  const result = await callWithCharacter(client, instance.store, {
    name: 'pixel_draw',
    arguments: {
      projectId: p.id,
      operations: [{ type: 'pixels', pixels: [{ x: 10, y: 10, color: '#aa44ee' }] }],
      label: 'Live MCP browser test',
    },
  });
  assert.ok(!result.isError);
  await pixel(page, 10, 10, [170, 68, 238, 255]);
  await pixel(peer, 10, 10, [170, 68, 238, 255]);
  await page.locator('#activity').filter({ hasText: 'Live MCP browser test' }).waitFor();
  await page.locator('#connect').click();
  assert.equal(await page.locator('#endpoint').textContent(), origin + '/mcp');
  await page.locator('#connectDialog [data-close]').click();
  console.log('PASS: real MCP edits visible in both browsers and activity log');

  const unityProject = path.join(temp, 'Unity Test Project');
  const spriteFolder = path.join(unityProject, 'Assets', 'Sprites');
  pickedFolder = spriteFolder;
  mkdirSync(spriteFolder, { recursive: true });
  mkdirSync(path.join(unityProject, 'ProjectSettings'));
  writeFileSync(
    path.join(unityProject, 'ProjectSettings', 'ProjectVersion.txt'),
    'm_EditorVersion: 6000.5.10f1',
  );
  await page.locator('#unity').click();
  await page.locator('#unityEnabled').check();
  await page.locator('#infoBrowse').click();
  await page.waitForFunction(
    (folder) => document.querySelector('#unityFolder').value === folder,
    spriteFolder,
  );
  await page.locator('#unityFileName').fill('dog');
  await page.locator('#infoMainFolder').check();
  await page.locator('#unityForm button[type="submit"]').click();
  await page.locator('#unityDialog').waitFor({ state: 'hidden' });
  assert.ok(existsSync(path.join(spriteFolder, 'dog-idle.png')));
  assert.ok(existsSync(path.join(spriteFolder, 'Editor', 'PixelForgeSpriteImporter.cs')));
  const liveEdit = await callWithCharacter(client, instance.store, {
    name: 'pixel_draw',
    arguments: { operations: [{ type: 'pixels', pixels: [{ x: 11, y: 10, color: '#ee3399' }] }] },
  });
  assert.ok(!liveEdit.isError);
  const deadline = Date.now() + 4000;
  while (true) {
    const synced = PNG.sync.read(readFileSync(path.join(spriteFolder, 'dog-idle.png')));
    const rgba = [...synced.data.slice((10 * 16 + 11) * 4, (10 * 16 + 11) * 4 + 4)];
    if (rgba.join(',') === '238,51,153,255') break;
    assert.ok(Date.now() < deadline, 'MCP edit did not reach the Unity folder');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  await page.locator('#unity').click();
  await page.locator('#unityStatus').filter({ hasText: 'Synced:' }).waitFor();
  assert.equal(await page.locator('#infoMainFolder').isChecked(), true);
  await page.locator('#unityEnabled').uncheck();
  await page.locator('#unityForm button[type="submit"]').click();
  await page.locator('#unityDialog').waitFor({ state: 'hidden' });
  console.log('PASS: Unity sync UI configuration, importer installation, and automatic MCP-to-PNG export');

  const unrealFolder = path.join(temp, 'Unreal Source Art');
  mkdirSync(unrealFolder);
  pickedFolder = unrealFolder;
  await page.locator('#unity').click();
  await page.locator('#infoMainFolder').uncheck();
  await page.locator('#infoEngine').selectOption('unreal');
  assert.equal(await page.locator('#infoUnityOptions').isVisible(), false);
  assert.equal(await page.locator('#infoUnrealHint').isVisible(), true);
  assert.equal(await page.locator('#unityFileName').isVisible(), true);
  await page.locator('#infoBrowse').click();
  await page.waitForFunction(
    (folder) => document.querySelector('#unityFolder').value === folder,
    unrealFolder,
  );
  await page.locator('#unityEnabled').check();
  await page.locator('#unityForm button[type="submit"]').click();
  await page.locator('#unityDialog').waitFor({ state: 'hidden' });
  assert.ok(existsSync(path.join(unrealFolder, 'dog-idle.png')));
  assert.equal(existsSync(path.join(unrealFolder, 'Editor')), false);
  console.log('PASS: Project info engine selection, Browse button, and Unreal PNG source export');

  await page.locator('#export').click();
  await page.locator('#exportKind').selectOption('frame');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportForm button[type="submit"]').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'browser-verification-idle.png');
  const file = path.join(temp, 'export.png');
  await download.saveAs(file);
  const png = PNG.sync.read(readFileSync(file));
  assert.equal(png.width, 16);
  assert.equal(png.data[3], 0);
  assert.deepEqual([...png.data.slice((10 * 16 + 10) * 4, (10 * 16 + 10) * 4 + 4)], [170, 68, 238, 255]);
  const projectDownloadPromise = page.waitForEvent('download');
  await page.locator('#save').click();
  const projectDownload = await projectDownloadPromise;
  const savedPath = path.join(temp, 'project.pixel.json');
  await projectDownload.saveAs(savedPath);
  const saved = JSON.parse(readFileSync(savedPath, 'utf8'));
  assert.equal(saved.frames.length, 4);
  assert.equal(saved.animations.length, 2);
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .locator('#fileInput')
    .setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: readFileSync(file) });
  await page.waitForFunction(() => document.querySelector('#projectTitle').textContent.includes('test'));
  const importedProjectId = instance.store.project.id;
  assert.equal((await (await fetch(origin + '/api/project-info')).json()).enabled, false);
  await page.locator('#unity').click();
  assert.equal(await page.locator('#unityFolder').inputValue(), spriteFolder);
  assert.equal(await page.locator('#infoMainFolder').isChecked(), true);
  assert.notEqual(await page.locator('#unityFileName').inputValue(), 'dog');
  await page.locator('#unityDialog [data-close]').click();
  await pixel(page, 10, 10, [170, 68, 238, 255]);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#fileInput').setInputFiles(savedPath);
  await page.waitForFunction(() =>
    document.querySelector('#projectTitle').textContent.includes('Browser verification'),
  );
  await page.waitForFunction(() => document.querySelectorAll('.frame-card').length === 2);
  await page.locator('#unity').click();
  assert.equal(await page.locator('#infoEngine').inputValue(), 'unreal');
  assert.equal(await page.locator('#unityFolder').inputValue(), unrealFolder);
  assert.equal(await page.locator('#infoMainFolder').isChecked(), false);
  await page.locator('#unityDialog [data-close]').click();
  await page.locator('#projects').click();
  await page.locator('#projectsDialog').waitFor({ state: 'visible' });
  assert.ok((await page.locator('.project-entry').count()) >= 2);
  assert.ok(await page.locator('.project-entry').filter({ hasText: 'Browser verification' }).count());
  await page.locator(`.project-entry[data-project="${importedProjectId}"]`).click();
  await page.waitForFunction(() => document.querySelector('#projectTitle').textContent.includes('test'));
  await page.locator('#projects').click();
  await page.locator(`.project-entry[data-project="${saved.id}"]`).click();
  await page.waitForFunction(() =>
    document.querySelector('#projectTitle').textContent.includes('Browser verification'),
  );
  await page.getByRole('tab', { name: 'Sprint', exact: true }).waitFor();
  console.log('PASS: saved Projects panel reopens characters with their animation groups');
  console.log('PASS: transparent PNG download/import and full project round trip');
  console.log('PASS: main folder checkbox, inheritance across projects, and per-project override');
  const companion = await callWithCharacter(client, instance.store, {
    name: 'pixel_draw',
    arguments: {
      projectId: saved.id,
      operations: [
        { type: 'new_project', name: 'Tab companion', width: 8, height: 8 },
        { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#fa44aa' }] },
      ],
    },
  });
  assert.ok(!companion.isError);
  const companionId = instance.store.project.id;
  await page.waitForFunction(() => document.querySelector('#art').width === 8);
  await pixel(peer, 0, 0, [250, 68, 170, 255]);
  await page.locator('#projectTabs').getByRole('tab', { name: 'Tab companion', exact: true }).waitFor();
  await page.locator(`[data-project-tab="${saved.id}"]`).click();
  await pixel(page, 10, 10, [170, 68, 238, 255]);
  await page.getByRole('tab', { name: 'Sprint', exact: true }).waitFor();
  page.once('dialog', (dialog) => dialog.accept('Renamed character'));
  await page.locator('#projectTitle').click();
  await peer.locator('#projectTabs').getByRole('tab', { name: 'Renamed character', exact: true }).waitFor();
  const tabsBeforeClose = await page.locator('#projectTabs [role="tab"]').count();
  await page.locator(`[data-close-project-tab="${companionId}"]`).click();
  await page.waitForFunction(
    (count) => document.querySelectorAll('#projectTabs [role="tab"]').length === count,
    tabsBeforeClose - 1,
  );
  assert.equal(instance.store.project.id, saved.id);
  await page.locator('#projects').click();
  await page.locator(`.project-entry[data-project="${companionId}"]`).click();
  await pixel(page, 0, 0, [250, 68, 170, 255]);
  await page.locator(`[data-close-project-tab="${companionId}"]`).click();
  await page.waitForFunction((id) => !document.querySelector(`[data-project-tab="${id}"]`), companionId);
  assert.notEqual(instance.store.project.id, companionId);
  await page.locator(`[data-project-tab="${saved.id}"]`).click();
  await pixel(page, 10, 10, [170, 68, 238, 255]);
  const tabOrder = await page
    .locator('#projectTabs [role="tab"]')
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.projectTab));
  await page.reload();
  await page.locator('#connection').filter({ hasText: 'Live canvas' }).waitFor();
  assert.deepEqual(
    await page
      .locator('#projectTabs [role="tab"]')
      .evaluateAll((buttons) => buttons.map((button) => button.dataset.projectTab)),
    tabOrder,
  );
  await page.locator(`[data-project-tab="${saved.id}"]`).focus();
  await page.keyboard.press('Home');
  await page.waitForFunction(
    (id) => document.querySelector('#projectTabs [aria-selected="true"]').dataset.projectTab === id,
    initialProjectId,
  );
  await page.locator(`[data-project-tab="${saved.id}"]`).click();
  await page.waitForFunction(() => document.querySelector('#art').width === 16);
  console.log(
    'PASS: new project tabs from UI/MCP, live names, switching, closing/reopening, reload, and keyboard navigation',
  );
  for (const width of [1280, 1024, 800]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.body.scrollWidth > innerWidth), false);
    await page.locator('#zoomFit').click();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: responsive desktop layouts and no JavaScript errors');
} finally {
  await client.close();
  await browser?.close();
  instance.close();
  http.closeAllConnections();
  await new Promise((resolve) => http.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}

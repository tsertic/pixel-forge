import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { Store } from '../src/store.js';
import { createProject, composite, projectSchema, linePoints } from '../src/model.js';
import { renderPNG, sheetMetadata } from '../src/png.js';
const setup = () => {
  const s = new Store();
  s.apply([{ type: 'new_project', name: 'Test', width: 8, height: 8 }]);
  return s;
};
const cel = (s) =>
  s.project.frames.find((f) => f.id === s.project.activeFrameId).cels[s.project.activeLayerId];

test('transaction rolls back all prior operations when one sprite color is missing', () => {
  const s = setup(),
    before = JSON.stringify(s.snapshot());
  assert.throws(
    () =>
      s.apply([
        { type: 'rect', x: 0, y: 0, width: 4, height: 4, color: '#ffffff' },
        { type: 'sprite', rows: ['ab'], colors: { a: '#ff0000' } },
      ]),
    /Missing sprite color/,
  );
  assert.equal(JSON.stringify(s.snapshot()), before);
});
test('stale project edits are rejected', () => {
  const s = setup();
  assert.throws(() => s.apply([{ type: 'clear' }], 'You', 'x', 'old-project'), /project changed/);
});
test('stroke is one undo step, redo restores all pixels', () => {
  const s = setup();
  s.apply([{ type: 'line', x1: 0, y1: 0, x2: 7, y2: 7, color: '#abcdef' }]);
  assert.equal(cel(s).filter(Boolean).length, 8);
  s.history('undo');
  assert.equal(cel(s).filter(Boolean).length, 0);
  s.history('redo');
  assert.equal(cel(s).filter(Boolean).length, 8);
});
test('new edits clear redo while selections do not create undo entries', () => {
  const s = setup();
  s.apply([{ type: 'pixels', pixels: [{ x: 0, y: 0, color: '#aabbcc' }] }]);
  s.history('undo');
  s.apply([{ type: 'select', layerId: s.project.activeLayerId }]);
  assert.equal(s.redoStack.length, 1);
  s.apply([{ type: 'clear' }]);
  assert.equal(s.redoStack.length, 0);
});
test('shapes clip to canvas and flood fill respects a boundary', () => {
  const s = setup();
  s.apply([
    { type: 'rect', x: 1, y: 1, width: 6, height: 6, color: '#ffffff', filled: false },
    { type: 'fill', x: 2, y: 2, color: '#aabbcc' },
    { type: 'line', x1: -10, y1: 0, x2: 10, y2: 0, color: '#112233' },
  ]);
  assert.equal(cel(s)[2 * 8 + 2], '#aabbcc');
  assert.equal(cel(s)[7 * 8 + 7], null);
  assert.equal(cel(s).filter((c) => c === '#112233').length, 8);
  s.apply([{ type: 'fill', x: 2, y: 2, color: '#aabbcc' }]);
  assert.equal(cel(s).filter((c) => c === '#aabbcc').length, 16);
});
test('transparent sprite cells skip existing pixels and null symbols erase', () => {
  const s = setup();
  s.apply([
    { type: 'rect', x: 0, y: 0, width: 8, height: 8, color: '#123456' },
    { type: 'sprite', x: 0, y: 0, rows: ['.ab'], colors: { a: '#FFFFFF', b: null } },
  ]);
  assert.equal(cel(s)[0], '#123456');
  assert.equal(cel(s)[1], '#ffffff');
  assert.equal(cel(s)[2], null);
});
test('locked layer refuses mutations and entire batch rolls back', () => {
  const s = setup(),
    layerId = s.project.activeLayerId;
  s.apply([{ type: 'update_layer', layerId, locked: true }]);
  assert.throws(() => s.apply([{ type: 'pixels', pixels: [{ x: 0, y: 0, color: '#ffffff' }] }]), /locked/);
  assert.equal(cel(s)[0], null);
});
test('frames duplicate independently and layer structure stays aligned', () => {
  const s = setup();
  s.apply([
    { type: 'pixels', pixels: [{ x: 1, y: 1, color: '#ffffff' }] },
    { type: 'add_frame', duplicate: true },
    { type: 'clear' },
    { type: 'add_layer', name: 'Highlights' },
  ]);
  assert.equal(s.project.frames[0].cels[s.project.layers[0].id][9], '#ffffff');
  assert.equal(s.project.frames[1].cels[s.project.layers[0].id][9], null);
  for (const frame of s.project.frames) assert.equal(Object.keys(frame.cels).length, 2);
  s.apply([{ type: 'delete_layer', layerId: s.project.layers[0].id }]);
  assert.equal(s.project.layers.length, 1);
  projectSchema.parse(s.project);
});
test('cannot delete last frame/layer; missing frame does not delete any frame', () => {
  const s = setup();
  assert.throws(() => s.apply([{ type: 'delete_frame', frameId: s.project.activeFrameId }]), /at least/);
  assert.throws(() => s.apply([{ type: 'delete_layer', layerId: s.project.activeLayerId }]), /at least/);
  s.apply([{ type: 'add_frame', duplicate: false }]);
  assert.throws(() => s.apply([{ type: 'delete_frame', frameId: 'missing' }]), /Unknown/);
  assert.equal(s.project.frames.length, 2);
});
test('transforms flip and shift with transparent clipping', () => {
  const s = setup();
  s.apply([
    { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#abcdef' }] },
    { type: 'transform', direction: 'flip_x' },
  ]);
  assert.equal(cel(s)[7], '#abcdef');
  s.apply([{ type: 'transform', direction: 'right' }]);
  assert.equal(cel(s).filter(Boolean).length, 0);
});
test('alpha composite respects layer order, visibility, opacity and PNG alpha', () => {
  const s = setup();
  s.apply(
    [
      { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#ff0000' }] },
      { type: 'add_layer', name: 'Blue' },
      { type: 'pixels', pixels: [{ x: 0, y: 0, color: '#0000ff' }] },
      { type: 'update_layer', layerId: 'missing', visible: false },
    ].slice(0, 3),
  );
  const top = s.project.activeLayerId;
  s.apply([{ type: 'update_layer', layerId: top, opacity: 0.5 }]);
  assert.deepEqual([...composite(s.project).slice(0, 4)], [128, 0, 128, 255]);
  s.apply([{ type: 'update_layer', layerId: top, visible: false }]);
  const png = PNG.sync.read(renderPNG(s.project, { scale: 2 }));
  assert.equal(png.width, 16);
  assert.deepEqual([...png.data.slice(0, 4)], [255, 0, 0, 255]);
  assert.equal(png.data[(2 * 16 + 2) * 4 + 3], 0);
  assert.throws(() => renderPNG(s.project, { scale: 1.5 }), /Scale/);
});
test('ellipse draws distinct filled and outlined regions, including 1px', () => {
  const s = setup();
  s.apply([{ type: 'ellipse', x: 0, y: 0, width: 7, height: 7, color: '#abcdef', filled: false }]);
  assert.equal(cel(s)[3 * 8 + 3], null);
  assert.equal(cel(s)[3], '#abcdef');
  s.apply([{ type: 'ellipse', x: 3, y: 3, width: 1, height: 1, color: '#112233' }]);
  assert.equal(cel(s)[27], '#112233');
});
test('spritesheet export dimensions and metadata preserve frame timing', () => {
  const s = setup();
  s.apply([
    { type: 'add_frame', duplicate: false },
    { type: 'settings', fps: 10 },
  ]);
  const png = PNG.sync.read(renderPNG(s.project, { sheet: true }));
  assert.equal(png.width, 16);
  assert.equal(png.height, 8);
  const meta = sheetMetadata(s.project);
  assert.equal(meta.frames[1].x, 8);
  assert.equal(meta.frames[0].duration, 100);
});
test('project validation refuses corrupt cel length, duplicate IDs, invalid active frame', () => {
  const p = createProject('x', 2, 2);
  p.frames[0].cels[p.activeLayerId] = [null];
  assert.throws(() => projectSchema.parse(p), /dimensions/);
  const q = createProject();
  q.activeFrameId = 'bad';
  assert.throws(() => projectSchema.parse(q), /selection/);
});
test('autosave survives reload; corrupt saved file is preserved and reported', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pixel-forge-test-'));
  try {
    const file = path.join(dir, 'project.json'),
      s = new Store(file);
    s.apply([{ type: 'settings', name: 'Saved sprite' }]);
    assert.equal(new Store(file).project.name, 'Saved sprite');
    writeFileSync(file, 'broken');
    assert.throws(() => new Store(file));
    assert.equal(readFileSync(file, 'utf8'), 'broken');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('Bresenham includes both endpoints in both directions', () => {
  for (const [a, b] of [
    [0, 7],
    [7, 0],
  ]) {
    const points = linePoints(a, 0, b, 3);
    assert.deepEqual(points[0], [a, 0]);
    assert.deepEqual(points.at(-1), [b, 3]);
    assert.equal(points.length, 8);
  }
});
test('scaled export metadata matches the image and selected frame', () => {
  const s = setup();
  s.apply([{ type: 'add_frame', duplicate: true }]);
  const single = sheetMetadata(s.project, { sheet: false, scale: 4 });
  assert.equal(single.image, 'test-idle.png');
  assert.equal(single.frames.length, 1);
  assert.equal(single.frames[0].id, s.project.activeFrameId);
  assert.equal(single.meta.size.w, 32);
  const sheet = sheetMetadata(s.project, { sheet: true, scale: 2 });
  assert.equal(sheet.image, 'test-idle.png');
  assert.equal(sheet.frames[1].x, 16);
  assert.equal(sheet.meta.size.w, 32);
});

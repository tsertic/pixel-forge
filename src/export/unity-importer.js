import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from '../fs/atomic-write.js';

const template = fileURLToPath(new URL('../../unity/Editor/PixelForgeSpriteImporter.cs', import.meta.url));
export function installUnityImporter(folder) {
  const file = path.join(folder, 'Editor', 'PixelForgeSpriteImporter.cs');
  if (existsSync(file) && !readFileSync(file, 'utf8').startsWith('// Pixel Forge managed Unity bridge v1'))
    throw new Error(
      'An existing custom PixelForgeSpriteImporter.cs would be overwritten. Move it or disable importer installation.',
    );
  const suffix = createHash('sha256').update(folder.toLowerCase()).digest('hex').slice(0, 12);
  const source = readFileSync(template, 'utf8').replace(
    'namespace PixelForgeBridge',
    `namespace PixelForgeBridge_${suffix}`,
  );
  mkdirSync(path.dirname(file), { recursive: true });
  if (!existsSync(file) || readFileSync(file, 'utf8') !== source) atomicWrite(file, source);
}

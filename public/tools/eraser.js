import { pencil } from './pencil.js';

// Erasing uses the same brush footprints and symmetry as pencil strokes.
export const eraser = {
  ...pencil,
  id: 'eraser',
  name: 'Eraser',
  key: 'E',
  erase: true,
  icon: '<path d="m3 12 9-10 7 6-9 10H8l-5-6Z"/><path d="m7 8 7 6M9 18h11"/>',
};

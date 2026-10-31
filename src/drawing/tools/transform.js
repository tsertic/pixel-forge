export function transformCel({ pixels, width, height, put }, { direction }) {
  const original = [...pixels];
  pixels.fill(null);
  const dx = direction === 'right' ? 1 : direction === 'left' ? -1 : 0;
  const dy = direction === 'down' ? 1 : direction === 'up' ? -1 : 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nextX = direction === 'flip_x' ? width - 1 - x : x + dx;
      const nextY = direction === 'flip_y' ? height - 1 - y : y + dy;
      put(nextX, nextY, original[y * width + x]);
    }
  }
}

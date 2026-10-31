export function floodFill({ pixels, width, height }, { x, y, color }) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const start = y * width + x,
    previous = pixels[start];
  if (previous === color) return;
  const stack = [start];
  pixels[start] = color;
  while (stack.length) {
    const index = stack.pop(),
      column = index % width,
      row = Math.floor(index / width);
    for (const [nx, ny] of [
      [column - 1, row],
      [column + 1, row],
      [column, row - 1],
      [column, row + 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (pixels[next] === previous) {
        pixels[next] = color;
        stack.push(next);
      }
    }
  }
}

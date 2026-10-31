export function drawPixels({ put }, operation) {
  for (const pixel of operation.pixels) put(pixel.x, pixel.y, pixel.color);
}

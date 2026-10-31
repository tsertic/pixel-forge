export function paintSprite({ put }, operation) {
  for (let y = 0; y < operation.rows.length; y++) {
    for (let x = 0; x < operation.rows[y].length; x++) {
      const symbol = operation.rows[y][x];
      if (symbol === operation.transparent) continue;
      if (!Object.hasOwn(operation.colors, symbol)) throw new Error(`Missing sprite color for '${symbol}'.`);
      put(operation.x + x, operation.y + y, operation.colors[symbol]);
    }
  }
}

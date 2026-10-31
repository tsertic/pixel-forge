// Pure pixel geometry shared by the canvas preview and the server's drawing tools.
export function linePoints(x1, y1, x2, y2) {
  const points = [];
  const dx = Math.abs(x2 - x1),
    sx = x1 < x2 ? 1 : -1;
  const dy = -Math.abs(y2 - y1),
    sy = y1 < y2 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    points.push([x1, y1]);
    if (x1 === x2 && y1 === y2) break;
    const twiceError = error * 2;
    if (twiceError >= dy) {
      error += dy;
      x1 += sx;
    }
    if (twiceError <= dx) {
      error += dx;
      y1 += sy;
    }
  }
  return points;
}

export function strokeBounds(stroke) {
  return {
    x: Math.min(stroke.start.x, stroke.last.x),
    y: Math.min(stroke.start.y, stroke.last.y),
    width: Math.abs(stroke.start.x - stroke.last.x) + 1,
    height: Math.abs(stroke.start.y - stroke.last.y) + 1,
  };
}

export function rectanglePoints({ x, y, width, height }, filled = true) {
  const points = [];
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      if (filled || column === 0 || row === 0 || column === width - 1 || row === height - 1) {
        points.push([x + column, y + row]);
      }
    }
  }
  return points;
}

export function ellipsePoints({ x, y, width, height }, filled = true) {
  const points = [];
  const inside = (column, row) =>
    ((column + 0.5 - width / 2) / (width / 2)) ** 2 + ((row + 0.5 - height / 2) / (height / 2)) ** 2 <= 1;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const edge =
        !inside(column - 1, row) ||
        !inside(column + 1, row) ||
        !inside(column, row - 1) ||
        !inside(column, row + 1);
      if (inside(column, row) && (filled || edge)) points.push([x + column, y + row]);
    }
  }
  return points;
}

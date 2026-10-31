export const fill = {
  id: 'fill',
  name: 'Fill',
  key: 'F',
  kind: 'instant',
  icon: '<path d="m3 10 7-7 8 8-7 7-8-8Z"/><path d="m7 1 4 4M3 10h15M19 14s-3 4-1 5 4-1 1-5Z"/>',
  activate({ point, color, target, action }) {
    return action([{ type: 'fill', ...target, ...point, color }], 'Fill');
  },
};

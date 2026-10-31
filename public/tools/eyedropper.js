export const eyedropper = {
  id: 'picker',
  name: 'Eyedropper',
  key: 'I',
  kind: 'instant',
  readOnly: true,
  icon: '<path d="m13 3 4-2 3 3-2 4M10 4l9 9M13 7 4 16l-1 4 4-1 9-9"/>',
  activate({ point, preview, setColor }) {
    const rgba = preview.getContext('2d').getImageData(point.x, point.y, 1, 1).data;
    if (!rgba[3]) {
      setColor(null);
      return;
    }
    const channels = [...rgba].slice(0, rgba[3] === 255 ? 3 : 4);
    setColor('#' + channels.map((channel) => channel.toString(16).padStart(2, '0')).join(''));
  },
};

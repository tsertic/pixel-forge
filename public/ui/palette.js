import { $ } from './dom.js';

export function createPalettePanel({ getProject, getColor, setColor, action, toast }) {
  function renderPalette() {
    const container = $('palette');
    container.replaceChildren();
    for (const c of getProject().palette) {
      const button = document.createElement('button');
      button.className = 'swatch';
      button.dataset.color = c;
      button.style.background = c;
      button.title = c;
      button.setAttribute('aria-label', `Color ${c}`);
      button.classList.toggle('active', c === getColor());
      button.onclick = () => setColor(c);
      container.append(button);
    }
  }
  $('primaryColor').onclick = () => $('colorPicker').click();
  $('colorPicker').oninput = (e) => setColor(e.target.value);
  $('transparent').onclick = () => setColor(null);
  $('hex').onchange = (e) => {
    const value = e.target.value.replace(/^#/, '');
    if (/^([\da-f]{6}|[\da-f]{8})$/i.test(value)) setColor('#' + value.toLowerCase());
    else {
      toast('Enter 6 or 8 hexadecimal characters.', true);
      setColor(getColor());
    }
  };
  $('addColor').onclick = () => {
    if (getColor() && !getProject().palette.includes(getColor()))
      action(
        [{ type: 'settings', palette: [...getProject().palette, getColor()] }],
        'Color added to palette',
      );
  };

  return { render: renderPalette };
}

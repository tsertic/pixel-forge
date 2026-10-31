import { $ } from './dom.js';
import { animationFileName } from '../../shared/animations.js';

export function bindFileActions({ getProject, action, perform, openDialog, toast }) {
  $('new').onclick = () => openDialog('newDialog');
  for (const button of document.querySelectorAll('[data-size]'))
    button.onclick = () => {
      $('newWidth').value = button.dataset.size;
      $('newHeight').value = button.dataset.size;
    };
  $('newForm').onsubmit = async (event) => {
    event.preventDefault();
    const result = await action(
      [
        {
          type: 'new_project',
          name: $('newName').value.trim(),
          width: Number($('newWidth').value),
          height: Number($('newHeight').value),
        },
      ],
      'New project',
    );
    if (result) $('newDialog').close();
  };
  $('projectTitle').onclick = () => {
    const name = prompt('Project name:', getProject().name);
    if (name?.trim()) action([{ type: 'settings', name: name.trim() }], 'Project renamed');
  };
  function download(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
  }
  $('save').onclick = () => {
    download('/api/project');
    toast('Project saved as .pixel.json');
  };
  $('open').onclick = () => $('fileInput').click();
  $('fileInput').onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast('The file is too large (20 MB maximum).', true);
      return;
    }
    if (!confirm('Open this file as a project? The current project stays in its tab.')) return;
    try {
      if (file.name.toLowerCase().endsWith('.png')) {
        const bitmap = await createImageBitmap(file);
        try {
          if (bitmap.width > 256 || bitmap.height > 256)
            throw new Error('Import a pixel art PNG up to 256 × 256 px.');
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bitmap, 0, 0);
          const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data,
            pixels = [];
          for (let i = 0; i < data.length; i += 4)
            if (data[i + 3])
              pixels.push({
                x: (i / 4) % bitmap.width,
                y: Math.floor(i / 4 / bitmap.width),
                color: '#' + [...data.slice(i, i + 4)].map((v) => v.toString(16).padStart(2, '0')).join(''),
              });
          await action(
            [
              {
                type: 'new_project',
                name: file.name.replace(/\.png$/i, '').slice(0, 80) || 'Imported sprite',
                width: bitmap.width,
                height: bitmap.height,
              },
              { type: 'pixels', pixels },
            ],
            'PNG imported',
          );
        } finally {
          bitmap.close();
        }
      } else {
        await perform('/api/import', JSON.parse(await file.text()));
      }
    } catch (error) {
      toast(error.message, true);
    }
  };
  let exportProjectId;
  const updateExportName = () => {
    const extension = $('exportKind').value === 'metadata' ? '.json' : '.png';
    $('exportFileName').textContent = animationFileName(getProject(), $('exportAnimation').value) + extension;
  };
  $('export').onclick = () => {
    const project = getProject();
    exportProjectId = project.id;
    $('exportAnimation').replaceChildren(
      ...project.animations.map((animation) => {
        const option = document.createElement('option');
        option.value = animation.id;
        option.textContent = animation.name;
        return option;
      }),
    );
    $('exportAnimation').value = project.activeAnimationId;
    updateExportName();
    openDialog('exportDialog');
  };
  $('exportKind').onchange = updateExportName;
  $('exportAnimation').onchange = updateExportName;
  $('exportForm').onsubmit = async (event) => {
    event.preventDefault();
    const kind = $('exportKind').value,
      scale = $('exportScale').value,
      animationId = $('exportAnimation').value,
      query = new URLSearchParams({ animationId, scale, projectId: exportProjectId }),
      url =
        kind === 'metadata'
          ? `/api/sheet.json?${query}`
          : `/api/export?${query}&sheet=${kind === 'sheet'}${animationId === getProject().activeAnimationId ? '&frameId=' + encodeURIComponent(getProject().activeFrameId) : ''}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error);
      }
      const blob = await response.blob(),
        objectUrl = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = objectUrl;
      a.download =
        response.headers
          .get('Content-Disposition')
          ?.match(/(?:^|;)\s*filename="?([^";]+)"?/i)?.[1]
          ?.trim() ?? (kind === 'metadata' ? 'animation.json' : 'animation.png');
      a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      $('exportDialog').close();
      toast('Your export is ready.');
    } catch (error) {
      toast(error.message, true);
    }
  };
}

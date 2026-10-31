import { $ } from './dom.js';
import { animationFileName } from '../../shared/animations.js';

export function createProjectInfo({ getSnapshot, request, perform, openDialog, toast }) {
  let infoProjectId = null;
  function renderUnityStatus() {
    const sync = getSnapshot()?.projectInfo ?? getSnapshot()?.unity;
    if (!sync) return;
    $('unity').classList.toggle('sync-active', sync.enabled && !sync.error);
    $('unity').classList.toggle('sync-error', !!sync.error);
    $('unity').title =
      sync.error ??
      (sync.enabled
        ? `${sync.engine === 'unreal' ? 'Unreal' : 'Unity'} export: ${sync.folder}`
        : 'Project details and Unity / Unreal export folder');
    $('unityStatus').classList.toggle('sync-error', !!sync.error);
    $('unityStatus').textContent = sync.error
      ? `Export failed: ${sync.error}`
      : !sync.enabled
        ? 'Automatic export is off.'
        : sync.pending
          ? 'Waiting for the latest edits…'
          : sync.lastExport
            ? `Synced: ${sync.lastExport.path}`
            : 'Automatic export is enabled.';
  }
  function renderEngineFields() {
    const unity = $('infoEngine').value === 'unity';
    $('infoUnityOptions').hidden = !unity;
    $('infoUnrealHint').hidden = unity;
    $('unityPPU').required = unity;
    $('unityFolder').placeholder = unity
      ? 'C:\\Your Unity Project\\Assets\\Sprites'
      : 'C:\\Your Unreal Project\\Content\\Sprites';
    $('infoFolderHint').textContent = unity
      ? "Choose a folder inside your Unity project's Assets directory."
      : 'Choose a PNG source folder, such as Content/Sprites, and monitor it in Unreal Auto Reimport.';
  }
  $('infoEngine').onchange = renderEngineFields;
  $('unity').onclick = () => {
    const sync = getSnapshot()?.projectInfo ?? getSnapshot()?.unity;
    if (!sync) return;
    infoProjectId = getSnapshot().project.id;
    $('infoProjectName').value = getSnapshot().project.name;
    $('infoDimensions').textContent =
      `${getSnapshot().project.width} × ${getSnapshot().project.height} px · ${getSnapshot().project.frames.length} frame${getSnapshot().project.frames.length === 1 ? '' : 's'} · ${getSnapshot().project.layers.length} layer${getSnapshot().project.layers.length === 1 ? '' : 's'}`;
    $('infoEngine').value = sync.engine ?? 'unity';
    $('infoBrowse').hidden = !getSnapshot().canBrowseFolders;
    $('unityEnabled').checked = sync.enabled;
    $('unityFolder').value = sync.folder;
    $('infoMainFolder').checked = sync.useAsMainFolder;
    $('infoMainFolderHint').textContent =
      (sync.mainFolder ? `Saved main folder: ${sync.mainFolder.folder}. ` : '') +
      'Remember this destination for all projects and after restarting. Each project keeps its own PNG filename and automatic export setting. Uncheck to use a separate folder for this project.';
    $('unityFileName').value = sync.folder
      ? sync.fileName
      : (getSnapshot().project.name ?? 'sprite')
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 64) || 'sprite';
    $('unityPPU').value = sync.pixelsPerUnit;
    $('unityImporter').checked = sync.installImporter;
    renderExportName();
    renderEngineFields();
    renderUnityStatus();
    openDialog('unityDialog');
  };
  function renderExportName() {
    $('infoExportName').textContent =
      'Selected animation exports as ' +
      animationFileName(getSnapshot().project, undefined, $('unityFileName').value || 'sprite') +
      '.png';
  }
  $('unityFileName').oninput = renderExportName;
  $('infoBrowse').onclick = async () => {
    const button = $('infoBrowse'),
      projectId = infoProjectId;
    button.disabled = true;
    button.textContent = 'Choosing…';
    try {
      const result = await request('/api/folders/pick', { initial: $('unityFolder').value.trim() });
      if (result.folder && getSnapshot().project.id === projectId && $('unityDialog').open)
        $('unityFolder').value = result.folder;
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Browse…';
    }
  };
  $('unityForm').onsubmit = async (event) => {
    event.preventDefault();
    const result = await perform('/api/project-info', {
      projectId: infoProjectId,
      name: $('infoProjectName').value.trim(),
      engine: $('infoEngine').value,
      enabled: $('unityEnabled').checked,
      folder: $('unityFolder').value.trim(),
      useAsMainFolder: $('infoMainFolder').checked,
      fileName: $('unityFileName').value.trim(),
      pixelsPerUnit:
        $('infoEngine').value === 'unity'
          ? Number($('unityPPU').value)
          : (getSnapshot().projectInfo?.pixelsPerUnit ?? 32),
      installImporter: $('unityImporter').checked,
    });
    if (result) {
      if (result.error) toast(result.error, true);
      else {
        toast(
          result.enabled
            ? result.engine === 'unreal'
              ? 'Project saved. Enable Auto Reimport for this folder in Unreal.'
              : 'Project saved. Focus Unity once to load the importer.'
            : 'Project info saved. Automatic export is off.',
        );
        $('unityDialog').close();
      }
    }
  };

  function update() {
    const snapshot = getSnapshot();
    if ($('unityDialog').open && infoProjectId !== snapshot.project.id) {
      $('unityDialog').close();
      toast('The active project changed. Reopen Project info to edit its destination.');
    }
    renderUnityStatus();
    if ($('unityDialog').open) renderExportName();
  }
  return { update };
}

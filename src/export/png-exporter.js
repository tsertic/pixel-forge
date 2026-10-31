import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWrite } from '../fs/atomic-write.js';
import { renderPNG } from '../png.js';
import { validateExportFolder } from './folders.js';
import { installUnityImporter } from './unity-importer.js';
import { animationFor, animationFileName } from '../../shared/animations.js';

export class PngExporter {
  paths(settings, project) {
    const folder = validateExportFolder(settings.folder, settings.engine);
    const name = project
      ? animationFileName(project, project.activeAnimationId, settings.fileName)
      : settings.fileName;
    return {
      folder,
      png: path.join(folder, name + '.png'),
      marker: path.join(folder, name + '.pixelforge.json'),
    };
  }
  prepare(project, settings) {
    const paths = this.paths(settings, project);
    if (existsSync(paths.png) || existsSync(paths.marker)) {
      let marker;
      try {
        marker = JSON.parse(readFileSync(paths.marker, 'utf8'));
      } catch {
        /* Report the conflict below. */
      }
      if (marker?.generator !== 'pixel-forge' || marker.version !== 1)
        throw new Error(
          'That filename already exists outside Pixel Forge sync. Choose a new filename to preserve it.',
        );
      if (marker.projectId && marker.projectId !== project.id)
        throw new Error(
          'Another Pixel Forge project owns that filename. Choose a different filename for this project.',
        );
      if (marker.animationId && marker.animationId !== project.activeAnimationId)
        throw new Error(
          'Another animation owns that filename. Choose a different animation name or filename.',
        );
    }
    if (settings.engine === 'unity' && settings.installImporter) installUnityImporter(paths.folder);
    return paths;
  }
  write(project, settings, revision) {
    const paths = this.prepare(project, settings);
    const marker = JSON.stringify(
      {
        generator: 'pixel-forge',
        version: 1,
        engine: settings.engine,
        pixelsPerUnit: settings.pixelsPerUnit,
        projectId: project.id,
        frameId: project.activeFrameId,
        animationId: project.activeAnimationId,
        animationName: animationFor(project).name,
        width: project.width,
        height: project.height,
      },
      null,
      2,
    );
    const markerChanged = !existsSync(paths.marker) || readFileSync(paths.marker, 'utf8') !== marker;
    const png = renderPNG(project, { scale: 1 });
    const pngChanged = !existsSync(paths.png) || !readFileSync(paths.png).equals(png);
    // Sidecar first, so Unity uses the intended settings when it imports the PNG.
    if (markerChanged) atomicWrite(paths.marker, marker);
    if (pngChanged || markerChanged) atomicWrite(paths.png, png);
    return {
      path: paths.png,
      time: new Date().toISOString(),
      revision,
      changed: pngChanged || markerChanged,
    };
  }
}

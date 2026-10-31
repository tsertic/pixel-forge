import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export function validateUnityFolder(folder) {
  if (!path.isAbsolute(folder) || !existsSync(folder) || !statSync(folder).isDirectory())
    throw new Error('Choose an existing absolute folder inside your Unity project’s Assets folder.');
  const real = realpathSync(folder);
  let candidate = real;
  while (true) {
    if (
      path.basename(candidate).toLowerCase() === 'assets' &&
      existsSync(path.join(path.dirname(candidate), 'ProjectSettings', 'ProjectVersion.txt'))
    ) {
      if (realpathSync(candidate) !== candidate)
        throw new Error('The Assets folder must not redirect outside the Unity project.');
      return real;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw new Error('This folder is not inside a Unity project’s Assets folder.');
}

export function validateExportFolder(folder, engine) {
  if (engine === 'unity') return validateUnityFolder(folder);
  if (!path.isAbsolute(folder) || !existsSync(folder) || !statSync(folder).isDirectory())
    throw new Error('Choose an existing absolute folder for your Unreal PNG source files.');
  return realpathSync(folder);
}

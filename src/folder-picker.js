import { execFile } from 'node:child_process';

// Run only when the user presses Browse. The path is passed through the environment,
// never interpolated into PowerShell code.
const script = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Choose the export folder for this Pixel Forge project'
$dialog.ShowNewFolderButton = $true
$initial = [Environment]::GetEnvironmentVariable('PIXEL_FORGE_PICKER_START')
if ($initial -and (Test-Path -LiteralPath $initial -PathType Container)) { $dialog.SelectedPath = $initial }
try {
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.Write($dialog.SelectedPath)
  }
} finally { $dialog.Dispose() }
`;

let picking = false;
export function pickFolder(initial = '') {
  if (process.platform !== 'win32')
    return Promise.reject(new Error('Paste the folder path directly on this platform.'));
  if (picking) return Promise.reject(new Error('A folder picker is already open.'));
  picking = true;
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', script],
      {
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 16384,
        env: { ...process.env, PIXEL_FORGE_PICKER_START: initial },
      },
      (error, stdout) => {
        picking = false;
        if (error)
          reject(new Error('The folder picker could not finish. Try again or paste the path directly.'));
        else resolve(stdout.trim() || null);
      },
    );
  });
}

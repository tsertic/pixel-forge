import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 3210);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PORT.');
const url = `http://127.0.0.1:${port}`;
let running = false;
try {
  const response = await fetch(url + '/api/state', { signal: AbortSignal.timeout(1500) });
  if (response.ok) running = (await response.json()).project?.format === 'pixel-forge-v1';
} catch {
  /* No running editor: start one below. */
}

if (running) {
  console.log(`Pixel Forge is already running: ${url}`);
  if (process.env.PIXEL_FORGE_NO_OPEN !== '1') {
    const command =
      process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => console.log(`Open ${url} in your browser.`));
    child.unref();
  }
} else {
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PIXEL_FORGE_OPEN: process.env.PIXEL_FORGE_NO_OPEN === '1' ? '0' : '1' },
  });
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.on('exit', (code) => {
    process.exitCode = code ?? 0;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
}

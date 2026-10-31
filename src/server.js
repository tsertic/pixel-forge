import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Store } from './store.js';
import { createMcpServer } from './mcp.js';
import { renderPNG, sheetMetadata, exportSelection } from './png.js';
import { slugify } from '../shared/animations.js';
import { ProjectSync } from './export/sync-service.js';
import { pickFolder } from './folder-picker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function createApp({
  store = new Store(path.join(root, 'data', 'autosave.pixel.json')),
  port = 3210,
  unitySettingsFile = store.file ? path.join(path.dirname(store.file), 'unity-sync.json') : null,
  folderPicker = pickFolder,
} = {}) {
  const app = express(),
    streams = new Set();
  const mcp = { lastActivity: null, lastTool: null, calls: 0 };
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const actualPort = req.socket.localPort ?? port;
    const allowed = new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);
    if (!allowed.has(req.headers.host)) return res.status(403).json({ error: 'Localhost requests only.' });
    if (
      req.headers.origin &&
      ![`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`].includes(req.headers.origin)
    )
      return res.status(403).json({ error: 'Cross-origin requests are disabled.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    next();
  });
  app.use(express.json({ limit: '24mb' }));
  const broadcast = () => {
    const event = `data: ${JSON.stringify(snapshot())}\n\n`;
    for (const res of streams) if (!res.writableEnded) res.write(event);
  };
  const unity = new ProjectSync(store, {
    file: unitySettingsFile,
    onChange: () => queueMicrotask(broadcast),
  });
  const snapshot = () => ({
    ...store.snapshot(),
    mcp,
    unity: unity.snapshot(),
    projectInfo: unity.snapshot(),
    canBrowseFolders: process.platform === 'win32' || folderPicker !== pickFolder,
  });
  store.on('change', broadcast);
  app.get('/api/state', (_req, res) => res.json(snapshot()));
  app.get('/api/projects', (_req, res, next) => {
    try {
      res.json(store.listProjects());
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/projects/open', (req, res, next) => {
    try {
      if (typeof req.body.id !== 'string' || req.body.id.length > 80) throw new Error('Invalid project ID.');
      res.json(store.openProject(req.body.id, req.body.projectId));
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/projects/close-tab', (req, res, next) => {
    try {
      if (typeof req.body.id !== 'string' || req.body.id.length > 80) throw new Error('Invalid project ID.');
      res.json(store.closeProjectTab(req.body.id, req.body.projectId));
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/folders/pick', async (req, res, next) => {
    try {
      const initial = req.body?.initial ?? '';
      if (typeof initial !== 'string' || initial.length > 2048 || initial.includes('\0'))
        throw new Error('Invalid initial folder.');
      res.json({ folder: await folderPicker(initial) });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/project-info', (_req, res) => res.json(unity.snapshot()));
  app.post('/api/project-info', (req, res, next) => {
    try {
      const name = req.body.name;
      if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 80))
        throw new Error('Project name must contain 1–80 characters.');
      const result = unity.configure(req.body);
      if (name !== undefined && name.trim() !== store.project.name)
        store.apply([{ type: 'settings', name: name.trim() }], 'You', 'Project renamed', req.body.projectId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/unity', (req, res, next) => {
    try {
      res.json(unity.configure({ ...req.body, engine: 'unity' }));
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/unity/export', (_req, res) => res.json(unity.flush()));
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    streams.add(res);
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    const timer = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    timer.unref();
    res.on('close', () => {
      clearInterval(timer);
      streams.delete(res);
    });
  });
  app.post('/api/actions', (req, res, next) => {
    try {
      const { operations, label, projectId } = req.body;
      res.json(
        store.apply(
          operations,
          'You',
          typeof label === 'string' ? label.slice(0, 100) : 'Canvas updated',
          projectId,
        ),
      );
    } catch (e) {
      next(e);
    }
  });
  app.post('/api/history', (req, res, next) => {
    try {
      if (!['undo', 'redo'].includes(req.body.direction)) throw new Error('Invalid history direction.');
      res.json(store.history(req.body.direction));
    } catch (e) {
      next(e);
    }
  });
  app.post('/api/import', (req, res, next) => {
    try {
      res.json(store.replace(req.body));
    } catch (e) {
      next(e);
    }
  });
  app.get('/api/project', (_req, res) => {
    res.attachment(slugify(store.project.name) + '.pixel.json');
    res.json(store.project);
  });
  app.get('/api/sheet.json', (req, res, next) => {
    try {
      if (req.query.projectId && req.query.projectId !== store.project.id)
        throw new Error('The project changed. Reopen Export.');
      const options = { animationId: req.query.animationId, scale: Number(req.query.scale ?? 1) };
      if (!Number.isInteger(options.scale) || options.scale < 1 || options.scale > 16)
        throw new Error('Invalid export scale.');
      const { fileName } = exportSelection(store.project, { ...options, sheet: true });
      res.attachment(fileName + '.json');
      res.json(sheetMetadata(store.project, options));
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/export', (req, res, next) => {
    try {
      if (req.query.projectId && req.query.projectId !== store.project.id)
        throw new Error('The project changed. Reopen Export.');
      const png = renderPNG(store.project, {
        frameId: req.query.frameId,
        animationId: req.query.animationId,
        sheet: req.query.sheet === 'true',
        scale: Number(req.query.scale ?? 1),
      });
      res.attachment(
        exportSelection(store.project, { animationId: req.query.animationId, frameId: req.query.frameId })
          .fileName + '.png',
      );
      res.type('png').send(png);
    } catch (e) {
      next(e);
    }
  });
  app.post('/mcp', async (req, res) => {
    // Stateless HTTP: every tool request reaches the same authoritative Store.
    const server = createMcpServer(store, (name) => {
      mcp.lastActivity = new Date().toISOString();
      mcp.lastTool = name;
      mcp.calls++;
      broadcast();
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ error: error.message });
    }
  });
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').end());
  app.use('/shared', express.static(path.join(root, 'shared')));
  app.use(express.static(path.join(root, 'public')));
  app.use((error, _req, res, _next) =>
    res.status(400).json({
      error: error.issues
        ? error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .slice(0, 4)
            .join('; ')
        : error.message,
    }),
  );
  return {
    app,
    store,
    unity,
    close: () => {
      unity.close();
      store.off('change', broadcast);
      for (const res of streams) res.end();
      streams.clear();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3210);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be 1024–65535.');
  const instance = createApp({ port });
  const server = instance.app.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(
      `Pixel Forge → ${url}\nMCP endpoint → ${url}/mcp\nAutosave → ${path.join(root, 'data', 'autosave.pixel.json')}`,
    );
    if (process.env.PIXEL_FORGE_OPEN === '1') {
      const command =
        process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
      const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
      child.on('error', () => console.log(`Open ${url} in your browser.`));
      child.unref();
    }
  });
  server.on('error', (error) => {
    console.error(
      error.code === 'EADDRINUSE'
        ? `Port ${port} is in use. Open the existing editor or set PORT to another number.`
        : error.message,
    );
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      instance.close();
      server.close(() => process.exit(0));
    });
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { instructions } from './mcp/instructions.js';
import { registerTool as registerGetProject } from './mcp/tools/get-project.js';
import { registerTool as registerGetPixels } from './mcp/tools/get-pixels.js';
import { registerTool as registerGetPreview } from './mcp/tools/get-preview.js';
import { registerTool as registerDraw } from './mcp/tools/draw.js';
import { registerTool as registerPaintSprite } from './mcp/tools/paint-sprite.js';
import { registerTool as registerHistory } from './mcp/tools/history.js';
import { registerTool as registerExport } from './mcp/tools/export.js';

export function createMcpServer(store, onActivity = () => {}) {
  const server = new McpServer({ name: 'pixel-forge', version: '1.0.0' }, { instructions });
  const register = (name, description, inputSchema, readOnly, fn) =>
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: false },
      },
      async (args) => {
        try {
          onActivity(name);
          const value = await fn(args);
          return value?.content ? value : { content: [{ type: 'text', text: JSON.stringify(value) }] };
        } catch (error) {
          return { isError: true, content: [{ type: 'text', text: error.message }] };
        }
      },
    );
  registerGetProject(register, store);
  registerGetPixels(register, store);
  registerGetPreview(register, store);
  registerDraw(register, store);
  registerPaintSprite(register, store);
  registerHistory(register, store);
  registerExport(register, store);
  return server;
}

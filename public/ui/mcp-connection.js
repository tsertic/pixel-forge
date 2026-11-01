import { $ } from './dom.js';

export function bindMcpConnection({ openDialog, toast }) {
  const endpoint = location.origin + '/mcp',
    commands = {
      codex: `codex mcp add pixel-forge --url ${endpoint}`,
      claude: `claude mcp add --transport http pixel-forge ${endpoint}`,
      json: JSON.stringify({ mcpServers: { 'pixel-forge': { url: endpoint } } }, null, 2),
    };
  $('endpoint').textContent = endpoint;
  $('codexCommand').textContent = commands.codex;
  $('claudeCommand').textContent = commands.claude;
  $('mcpJsonConfig').textContent = commands.json;
  $('downloadMcpConfig').onclick = () => {
    const url = URL.createObjectURL(new Blob([commands.json + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pixel-forge-mcp.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('MCP configuration downloaded.');
  };
  $('connect').onclick = $('connectSecondary').onclick = () => openDialog('connectDialog');
  for (const button of document.querySelectorAll('[data-copy]'))
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(commands[button.dataset.copy]);
        toast(button.dataset.copy === 'json' ? 'Configuration copied.' : 'Command copied.');
      } catch {
        toast('Select and copy the configuration or command shown in the dialog.', true);
      }
    };
}

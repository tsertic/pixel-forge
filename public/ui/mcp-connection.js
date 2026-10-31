import { $ } from './dom.js';

export function bindMcpConnection({ openDialog, toast }) {
  const endpoint = location.origin + '/mcp',
    commands = {
      codex: `codex mcp add pixel-forge --url ${endpoint}`,
      claude: `claude mcp add --transport http pixel-forge ${endpoint}`,
    };
  $('endpoint').textContent = endpoint;
  $('codexCommand').textContent = commands.codex;
  $('claudeCommand').textContent = commands.claude;
  $('connect').onclick = $('connectSecondary').onclick = () => openDialog('connectDialog');
  for (const button of document.querySelectorAll('[data-copy]'))
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(commands[button.dataset.copy]);
        toast('Command copied.');
      } catch {
        toast('Select and copy the command shown in the dialog.', true);
      }
    };
}

import { $ } from './dom.js';

export function renderActivity(state) {
  const container = $('activity');
  container.replaceChildren();
  for (const item of state.activity.slice(0, 5)) {
    const row = document.createElement('div');
    row.className = 'activity-item' + (item.actor === 'MCP' ? ' ai' : '');
    const dot = document.createElement('i'),
      label = document.createElement('span'),
      time = document.createElement('small');
    label.textContent = `${item.actor === 'MCP' ? 'MCP' : 'You'} · ${item.label}`;
    time.textContent = new Date(item.time).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    row.append(dot, label, time);
    container.append(row);
  }
  if (!state.activity.length) {
    const hint = document.createElement('div');
    hint.className = 'muted';
    hint.textContent = 'Manual edits and AI commands appear here.';
    container.append(hint);
  }
  if (state.mcp.calls) {
    $('aiStatus').replaceChildren();
    const title = document.createTextNode(
        `MCP · ${state.mcp.calls} ${state.mcp.calls === 1 ? 'call' : 'calls'}`,
      ),
      detail = document.createElement('span');
    detail.textContent = state.mcp.lastTool;
    $('aiStatus').append(title, detail);
  }
}

// Bộ điều phối thông điệp cục bộ giữa ui.html và code.js (không kết nối mạng).

async function runPluginCommand(cmd) {
  if (stConfig().readOnly && !['readState', 'liveFile', 'liveSelection', 'liveTree', 'liveImpact', 'exportPng'].includes(cmd?.name)) {
    return { id: cmd?.id, ok: false, error: 'Chế độ kiểm kê chỉ đọc trạng thái Figma.' };
  }
  const fn = Object.hasOwn(PLUGIN_COMMANDS, cmd?.name) && PLUGIN_COMMANDS[cmd.name];
  if (!fn) return { id: cmd && cmd.id, ok: false, error: 'Không nhận diện được lệnh ' + (cmd && cmd.name) + '.' };
  try {
    return { id: cmd.id, ok: true, value: await fn(cmd.args || {}) };
  } catch (err) {
    return { id: cmd.id, ok: false, error: (err && err.message) ? err.message : String(err) };
  }
}

async function handlePluginMessage(msg) {
  if (msg.type !== 'PLUGIN_CMD') return false;
  figma.ui.postMessage({ type: 'PLUGIN_RESULT', result: await runPluginCommand(msg.cmd) });
  return true;
}

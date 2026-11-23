// Engine link: dữ liệu để vân tay (04e) băm instance do engine dựng.
// Vân tay instance = tên + vị trí + giá trị các property đã khai lúc dựng (plugin data `lk`), không băm ruột: sửa component gốc không làm khung bị coi là sửa tay.
// Vân tay của instance do engine dựng (04e dùng): null nếu không phải instance của engine (không có plugin data `lk`).
function lkMeta(node) {
  const raw = node.getPluginData ? node.getPluginData('lk') : '';
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

function lkPropValues(node, bases) {
  const props = node.componentProperties || {};
  return bases.map((b) => {
    const k = Object.keys(props).find((x) => x.split('#')[0] === b);
    return k ? b + '=' + props[k].value : '';
  }).join(';');
}

function lkInstanceRow(node) {
  const meta = lkMeta(node);
  if (!meta) return null;
  const nested = node.findAll((x) => x.type === 'INSTANCE');
  const inner = (meta.n || []).map((bases, i) => (nested[i] ? lkPropValues(nested[i], bases) : '')).join('|');
  return ['INSTANCE', node.name, Math.round(node.x), Math.round(node.y), lkPropValues(node, meta.p || []), inner].join('|');
}

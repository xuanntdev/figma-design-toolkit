// Mọi chuỗi chữ trong snapshot (node k='t'), dùng để xuất chênh lệch chữ của màn đã sửa tay.
function snapSnapTexts(node, out) {
  if (!node) return out;
  if (node.k === 't' && typeof node.s === 'string') out.push(node.s);
  for (const c of node.children || node.c || []) snapSnapTexts(c, out);
  return out;
}

// Quy ước DESIGN_EXTENSION: nhóm/màn lấy từ SNAP_GROUPS (do các data/*.gen.json điền), dựng bằng snapBuildScreen.
const DESIGN_EXTENSION = {
  get groups() {
    return SNAP_GROUPS.slice().sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : 1));
  },
  prepare: snapPrepare,
  finish: snapFinish,
  build: (screen) => snapBuildScreen(screen),
  sourceKey: (screen) => JSON.stringify(SNAP_SNAPSHOTS[screen.stem] || null),
  sourceTexts: (screen) => snapSnapTexts(SNAP_SNAPSHOTS[screen.stem], []),
};

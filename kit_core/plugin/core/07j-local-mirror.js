// Gương Section (layout=grid): bản Cải tiến lặp lại cấu trúc Sáng/Tối → nhóm do designer vẽ trong Hiện tại (tìm hoặc tạo Section tương ứng,
// copy toạ độ/màu/bo góc, đặt khung đúng vị trí khung gốc). Đặt khung ô: localPlaceInSection (07b).

function localMirrorSection(parent, ref, tagKey, tagVal) {
  let sec = parent.children.find((n) => n.type === 'SECTION'
    && (stTagOf(n, tagKey) === tagVal || n.name === ref.name));
  if (!sec) {
    sec = figma.createSection();
    parent.appendChild(sec);
  }
  sec.name = ref.name;
  sec.x = ref.x;
  sec.y = ref.y;
  sec.resize(Math.max(sec.width, ref.width), Math.max(sec.height, ref.height));
  if (Array.isArray(ref.fills)) sec.fills = ref.fills.slice();
  if (Array.isArray(ref.strokes)) sec.strokes = ref.strokes.slice();
  if (typeof ref.cornerRadius === 'number') sec.cornerRadius = ref.cornerRadius;
  stTag(sec, { [tagKey]: tagVal });
  return sec;
}

function localFindRefFrame(refGroup, spec) {
  const byTag = refGroup.children.find((n) => n.type === 'FRAME' && stTagOf(n, 'screenId') === spec.id);
  if (byTag) return byTag;
  return refGroup.children.find((n) => n.type === 'FRAME'
    && (n.name === spec.title || n.name.startsWith(spec.id) || n.name.startsWith(spec.title + ' ·')
      || n.name.endsWith(' · ' + spec.title))) || null;
}

// Horizontal distance between two frames placed side by side (frame width from design-sync.json + gutter).
function localStep() {
  return ST_GRID.cellW + 56;
}

function localResolveSlot(targetGroup, refGroup, spec, groupSpec) {
  const refFrame = localFindRefFrame(refGroup, spec);
  if (refFrame) return { x: refFrame.x, y: refFrame.y };
  const frames = [...refGroup.children, ...targetGroup.children].filter((n) => n.type === 'FRAME');
  if (!frames.length) return { x: 60, y: 90 };
  const xs = [...new Set(frames.map((f) => f.x))].sort((a, b) => a - b);
  const step = xs.length > 1 ? Math.max(ST_GRID.cellW + 40, xs[1] - xs[0]) : localStep();
  const idx = groupSpec.screens.findIndex((s) => s.id === spec.id);
  const col = Math.max(0, idx) % ST_GRID.perRow;
  const row = Math.floor(Math.max(0, idx) / ST_GRID.perRow);
  return { x: (xs[0] || 60) + col * step, y: (frames[0].y || 90) + row * (ST_GRID.cellH + ST_GRID.gapY) };
}

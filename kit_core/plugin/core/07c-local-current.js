// target=current trên cây Section: dựng thẳng vào "Hiện tại" (Sáng/Tối → Nhóm → Frame), tự tạo vùng/nhóm nếu thiếu.
// Chỉ thay bản `source=ai` chưa duyệt của đúng màn + chủ đề; khung vẽ tay, ảnh chụp và bản đã duyệt giữ nguyên.

function localFindOrCreateSection(parent, name, tagKey, tagVal) {
  let sec = parent.children.find((n) => n.type === 'SECTION' && (stTagOf(n, tagKey) === tagVal || n.name === name));
  if (!sec) {
    sec = figma.createSection();
    parent.appendChild(sec);
    sec.name = name;
    const last = parent.children.filter((n) => n !== sec && n.type === 'SECTION').pop();
    sec.x = last ? last.x : 0;
    sec.y = last ? last.y + last.height + ST_GRID.gapY : 0;
    sec.resize(ST_GRID.cellW + 120, ST_GRID.cellH + 180);
  }
  stTag(sec, { [tagKey]: tagVal });
  return sec;
}

// Vị trí khung mới: chỗ của bản nháp cũ nếu có, không thì xếp tiếp bên phải khung cuối cùng trong nhóm.
function localNextSlot(group, drafts) {
  if (drafts.length) return { x: drafts[0].x, y: drafts[0].y };
  const frames = group.children.filter((n) => n.type === 'FRAME');
  if (!frames.length) return { x: 60, y: 90 };
  const right = Math.max(...frames.map((f) => f.x + f.width));
  return { x: right + 56, y: frames[0].y };
}

function localPlaceInCurrent(currentSide, target, replace, batchId) {
  const areaName = target.theme === 'dark' ? 'Tối' : 'Sáng';
  const area = localFindOrCreateSection(currentSide, areaName, LOCAL_THEME_KEY, target.theme);
  const group = localFindOrCreateSection(area, target.group.title, 'groupId', target.group.id);
  const same = group.children.filter((n) => n.type === 'FRAME' && stSameCell(n, target.screen.id, target.theme));
  const kept = same.filter((n) => stTagOf(n, 'source') !== 'ai' || stIsProtected(n));
  const drafts = same.filter((n) => !kept.includes(n));
  const base = { groupId: target.group.id, groupTitle: target.group.title, screenId: target.screen.id, theme: target.theme };
  if (!replace && same.length) return Object.assign(base, { frameId: same[0].id, reused: true, keptProtected: kept.length });
  const slot = localNextSlot(group, drafts);
  drafts.forEach((n) => n.remove());
  const frame = stExtension().build(target.screen.raw, target.theme);
  group.appendChild(frame);
  frame.x = slot.x;
  frame.y = slot.y;
  if (frame.x + frame.width + 60 > group.width) group.resize(frame.x + frame.width + 60, group.height);
  if (frame.y + frame.height + 60 > group.height) group.resize(group.width, frame.y + frame.height + 60);
  stTag(frame, { screenId: target.screen.id, theme: target.theme, source: 'ai', status: 'draft', variant: 0, batchId });
  return Object.assign(base, { frameId: frame.id, reused: false, replaced: drafts.length, keptProtected: kept.length });
}

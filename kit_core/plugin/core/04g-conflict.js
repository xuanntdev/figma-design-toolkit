// Xung đột merge: khung sửa tay H (conflict=1, conflictWith=<id bản mới>) và bản mới D (conflict=1, conflictOf=<id H>)
// cùng viền đỏ + nhãn đỏ "Xung đột" trên canvas. Chỉ người dùng mới giải: "Giữ bản sửa tay" (xoá D, base của H = nguồn mới,
// lần sau không báo lại) hoặc "Lấy bản mới" (xoá H, D thành chính). Không có lệnh nào tự xoá khung khi chưa được chọn.

const CF_RED = '#C62F26';
const CF_LABEL_W = 360;

function cfLabelOf(parent, frame) {
  return stLabelsOf(parent, frame).find((n) => stTagOf(n, 'part') === 'conflict');
}

// Nhãn "Xung đột" nằm cùng hàng với tên màn, sát mép phải khung.
function cfPlaceLabel(parent, frame) {
  const l = cfLabelOf(parent, frame);
  if (!l) return;
  const title = stLabelsOf(parent, frame).find((n) => stTagOf(n, 'part') === 'title');
  l.x = frame.x + frame.width - l.width;
  l.y = title ? title.y : frame.y - ST_GRID.gap - l.height;
}

function cfStash(frame) {
  if (stTagOf(frame, 'strokesBackup')) return;
  const w = frame.strokeWeight;
  stTag(frame, { strokesBackup: JSON.stringify({ s: frame.strokes || [], w: typeof w === 'number' ? w : null, a: frame.strokeAlign || null }) });
}

// Idempotent: đã có nhãn đúng chữ thì giữ nguyên (lượt lặp không tạo lại node).
function cfApply(parent, frame, text, tags) {
  cfStash(frame);
  frame.strokes = stSolid(CF_RED);
  frame.strokeWeight = 6;
  frame.strokeAlign = 'OUTSIDE';
  stTag(frame, tags);
  const old = cfLabelOf(parent, frame);
  if (old && old.characters === text) return cfPlaceLabel(parent, frame);
  if (old) old.remove();
  if (ST_GRID.labelH) {
    const t = stText(parent, text, 22, 'Semi Bold', CF_RED, frame.x, frame.y, CF_LABEL_W);
    t.textAlignHorizontal = 'RIGHT';
    stTag(t, { role: 'screenLabel', labelFor: frame.id, labelScreen: stTagOf(frame, 'screenId'), theme: stTagOf(frame, 'theme') || 'light', part: 'conflict' });
  }
  cfPlaceLabel(parent, frame);
}

function stMarkConflict(parent, base, draft) {
  cfApply(parent, base, 'Xung đột · bản sửa tay', { conflict: 1, conflictWith: draft.id });
  cfApply(parent, draft, 'Xung đột · bản mới', { conflict: 1, conflictOf: base.id });
}

// Gỡ dấu xung đột, trả lại viền cũ của khung (viền do designer đặt không mất).
function stClearConflict(parent, frame) {
  const raw = stTagOf(frame, 'strokesBackup');
  if (raw) {
    const b = JSON.parse(raw);
    frame.strokes = b.s;
    if (b.w != null) frame.strokeWeight = b.w;
    if (b.a) frame.strokeAlign = b.a;
  }
  stTag(frame, { conflict: '', conflictWith: '', conflictOf: '', strokesBackup: '' });
  if (parent) stLabelsOf(parent, frame).filter((n) => stTagOf(n, 'part') === 'conflict').forEach((n) => n.remove());
}

function cfWalk(node, fn) {
  for (const c of (node.children || []).slice()) {
    if (c.type === 'FRAME' && stTagOf(c, 'screenId')) fn(c);
    else if (c.children) cfWalk(c, fn);
  }
}

function cfPageOf(node) {
  let p = node;
  while (p && p.type !== 'PAGE') p = p.parent;
  return p;
}

function cfScreenText(frame) {
  const found = localFindSpec(stTagOf(frame, 'screenId'));
  return found ? stScreenText(found.group, found.screen) : frame.name;
}

// Danh sách cặp xung đột còn treo trên mọi trang: [{ keepId, newId, screenId, theme, groupId, text, pageId }].
async function cmdListConflicts() {
  await figma.loadAllPagesAsync();
  const marked = [];
  for (const page of figma.root.children) cfWalk(page, (f) => { if (stTagOf(f, 'conflict') === '1') marked.push(f); });
  const out = [];
  for (const h of marked.filter((f) => !stTagOf(f, 'conflictOf'))) {
    const d = marked.find((f) => stTagOf(f, 'conflictOf') === h.id);
    if (!d) continue;
    out.push({ keepId: h.id, newId: d.id, screenId: stTagOf(h, 'screenId'), theme: stTagOf(h, 'theme') || 'light', groupId: stTagOf(h, 'groupId'), text: cfScreenText(h), pageId: cfPageOf(h).id });
  }
  return { conflicts: out };
}

async function cfPair(args) {
  const h = await figma.getNodeByIdAsync(args.keepId);
  const d = await figma.getNodeByIdAsync(args.newId);
  if (!h || !d || h.removed || d.removed) throw new Error('Không tìm thấy cặp khung xung đột (đã bị xoá hoặc đổi).');
  if (stTagOf(h, 'conflict') !== '1' || stTagOf(d, 'conflictOf') !== h.id) throw new Error('Cặp khung không còn ở trạng thái xung đột.');
  return { h, d };
}

// Chọn hai khung của một xung đột và zoom tới (không ghi gì).
async function cmdFocusConflict(args) {
  const { h, d } = await cfPair(args);
  const page = cfPageOf(h);
  if (page && figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page);
  figma.currentPage.selection = [h, d];
  if (figma.viewport) figma.viewport.scrollAndZoomIntoView([h, d]);
  return { focused: [h.id, d.id] };
}

function cfKeepMine(h, d) {
  const src = stTagOf(d, 'srcHash');
  stDropLabels(d.parent, d);
  d.remove();
  stClearConflict(h.parent, h);
  stTag(h, { srcHash: src });
}

function cfTakeNew(h, d) {
  const samePlace = h.parent === d.parent;
  const spot = { x: h.x, y: h.y };
  stDropLabels(h.parent, h);
  h.remove();
  stClearConflict(d.parent, d);
  if (samePlace) {
    d.x = spot.x;
    d.y = spot.y;
    stPlaceLabels(d.parent, d);
  }
}

// args: { keepId, newId, choice: 'mine' | 'theirs', confirm } — 'theirs' xoá bản sửa tay nên bắt buộc confirm: true.
async function cmdResolveConflict(args) {
  assertCanWrite(args);
  if (args.choice !== 'mine' && args.choice !== 'theirs') throw new Error('choice chỉ nhận mine hoặc theirs.');
  if (args.choice === 'theirs' && args.confirm !== true) throw new Error('Lấy bản mới sẽ xoá bản sửa tay: cần xác nhận rõ ràng.');
  const { h, d } = await cfPair(args);
  liveAssertPages(h, d);
  const screenId = stTagOf(h, 'screenId');
  if (args.choice === 'mine') cfKeepMine(h, d);
  else cfTakeNew(h, d);
  LOCAL_LAST_BATCH = null;
  figma.commitUndo();
  return { choice: args.choice, screenId, remaining: (await cmdListConflicts()).conflicts.length };
}

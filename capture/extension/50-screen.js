// Dựng 1 màn từ snapshot thành frame chỉnh sửa được (rộng 1440, cao theo nội dung).
function snapScreenFrame(snap) {
  const frame = figma.createFrame();
  frame.name = snap.title;
  snapSize(frame, snap.w, snap.h);
  frame.layoutMode = 'NONE';
  frame.fills = snapPaint(snap.bg || '#FFFFFF');
  frame.clipsContent = true;
  return frame;
}

function snapBuildScreen(screen) {
  const snap = SNAP_SNAPSHOTS[screen.stem];
  if (!snap) throw new Error('Chưa có snapshot cho màn ' + screen.stem + '. Chạy capture/gen-plan.mjs rồi build lại.');
  const frame = snapScreenFrame(snap);
  snapChildren(frame, snap.children, snap);
  return frame;
}

// Gộp font của các màn sẽ dựng (DRAFT_PLAN.screenIds; không có thì tất cả) rồi nạp một lần.
async function snapPrepare() {
  const ids = (typeof DRAFT_PLAN !== 'undefined' && DRAFT_PLAN && DRAFT_PLAN.screenIds && DRAFT_PLAN.screenIds.length)
    ? DRAFT_PLAN.screenIds : Object.keys(SNAP_SNAPSHOTS);
  const fonts = {};
  for (const id of ids) {
    const snap = SNAP_SNAPSHOTS[id];
    if (!snap) continue;
    for (const fam of Object.keys(snap.fonts)) Object.assign(fonts[fam] = fonts[fam] || {}, snap.fonts[fam]);
  }
  fonts[SNAP_FALLBACK] = Object.assign(fonts[SNAP_FALLBACK] || {}, { 400: 1 });
  await snapLoadFonts(fonts);
}

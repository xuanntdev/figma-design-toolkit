// Xem trước (thuần đọc) bảng cho lượt Cập nhật sắp chạy (design-sync.json `preview: true`), và xuất các màn đã sửa tay/xung đột ra JSON.
// sync=merge dùng đúng mgPlan như lúc ghi nên bảng khớp kết quả; sync=replace chỉ phân biệt "dựng mới" và "thay bản nháp".

function pvChild(parent, type, tagKey, tagVal, name) {
  return parent && parent.children.find((n) => n.type === type && (stTagOf(n, tagKey) === tagVal || n.name === name));
}

// Nơi chứa khung của ô ở chế độ Section (layout=grid): vùng Sáng/Tối → nhóm, trong Hiện tại (target=current) hoặc Cải tiến.
function pvSectionParent(run, t) {
  const inCurrent = run.target === 'current';
  const area = pvChild(inCurrent ? run.currentSide : run.improvedSide, 'SECTION', LOCAL_THEME_KEY, t.theme, t.theme === 'dark' ? 'Tối' : 'Sáng');
  if (inCurrent) return pvChild(area, 'SECTION', 'groupId', t.group.id, t.group.title);
  return pvChild(area, 'SECTION', 'currentGroupId', t.refGroup && t.refGroup.id, t.refGroup && t.refGroup.name);
}

// Khung hiện có của một ô, tìm y như lúc ghi (không tạo gì). Cây Section: mọi nơi dưới gốc cây (cây mới lẫn bố cục cũ, cell index);
// Section mode xem pvSectionParent; không thì container.
function pvFrames(run, t, index) {
  if (index) return index.cells.get(stKey(t.theme, t.screen.id)) || [];
  let parent = null;
  if (!run.sectionMode) {
    const features = stFindPage(run.opts.pageFeatures);
    parent = features && stFindContainer(features, run.target);
  } else {
    parent = pvSectionParent(run, t);
  }
  if (!parent) return [];
  stAdoptLegacy(parent, t.screen.id, t.theme); // chỉ gắn lại tag cho khung bản cũ mất tag, đúng như lúc Cập nhật
  return parent.children.filter((n) => n.type === 'FRAME' && stSameCell(n, t.screen.id, t.theme));
}

// Hành động của một ô: merge theo mgPlan; replace = thay nếu đã có bản nháp chưa được bảo vệ, không thì dựng mới.
// (Section mode luôn ghi kiểu replace.)
function pvAction(frames, screen, run) {
  if (stSyncMerge() && !run.sectionMode) return mgPlan(frames, screen).action;
  const drafts = frames.filter((f) => stTagOf(f, 'source') === 'ai' && !stIsProtected(f));
  return drafts.length ? 'replace' : 'new';
}

// args như updateDraft. Trả { summary: { counts, items }, mode, target }.
async function cmdPreviewSync(args) {
  await figma.loadAllPagesAsync();
  const run = localResolveRun(args);
  await stPrepare();
  const themes = stProjectThemes(run.plan);
  const tree = run.target === 'current' && stLayoutTree();
  const root = tree ? trRootOf(run) : null;
  const index = tree ? trIndex(root, run.targets) : null;
  const rows = run.targets.map((t) => ({
    action: pvAction(pvFrames(run, t, index), t.screen.raw, run), screenId: t.screen.id, theme: t.theme, groupId: t.group.id,
    text: stScreenInfo(t.group, t.screen, t.theme, themes).text,
  }));
  return { mode: tree ? 'tree' : (run.sectionMode ? 'section' : 'container'), target: run.target, summary: mgSummarize(rows) };
}

function pvTexts(node, out) {
  if (node.type === 'TEXT') out.push(node.characters);
  for (const c of node.children || []) pvTexts(c, out);
  return out;
}

// Chênh lệch chữ (đa tập) giữa khung hiện tại và nguồn; null khi extension không có sourceTexts hoặc màn không nhúng.
function pvTextDiff(frame, screen) {
  const ext = stExtension();
  if (!screen || !ext.sourceTexts) return null;
  const left = {};
  for (const s of ext.sourceTexts(screen)) left[s] = (left[s] || 0) + 1;
  const added = [];
  for (const s of pvTexts(frame, [])) {
    if (left[s] > 0) left[s] -= 1;
    else added.push(s);
  }
  const removed = [];
  for (const s of Object.keys(left)) for (let i = 0; i < left[s]; i += 1) removed.push(s);
  return { added: added.slice(0, 200), removed: removed.slice(0, 200) };
}

function pvEditItem(f) {
  const id = stTagOf(f, 'screenId');
  const found = localFindSpec(id);
  return {
    screenId: id, code: found ? stScreenCode(found.group, found.screen) : '', title: found ? found.screen.title : f.name,
    groupId: stTagOf(f, 'groupId') || (found ? found.group.id : ''), theme: stTagOf(f, 'theme') || 'light',
    frameName: f.name, fp: stTagOf(f, 'fp'), fpNow: stFingerprint(f), srcHash: stTagOf(f, 'srcHash'),
    conflict: stTagOf(f, 'conflict') === '1' && !stTagOf(f, 'conflictOf'),
    texts: pvTextDiff(f, found && found.screen.raw),
  };
}

// Xuất các màn đã sửa tay (human + edited=1, hoặc khung ai đã khác vân tay) và màn đang xung đột, mọi trang (thuần đọc).
async function cmdExportEdits() {
  await figma.loadAllPagesAsync();
  const items = [];
  for (const page of figma.root.children) {
    cfWalk(page, (f) => {
      const source = stTagOf(f, 'source');
      if ((source === 'ai' || source === 'human') && !stTagOf(f, 'conflictOf') && mgIsEdited(f)) items.push(pvEditItem(f));
    });
  }
  return { kind: 'figma-edits', version: 1, plugin: PLUGIN_VERSION, count: items.length, items };
}

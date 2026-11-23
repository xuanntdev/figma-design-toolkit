// Xem trước (thuần đọc) bảng merge cho lượt Cập nhật sắp chạy, và xuất các màn đã sửa tay/xung đột ra JSON.
// Dùng đúng mgPlan như lúc ghi nên bảng xem trước khớp với kết quả Cập nhật.

function pvChild(parent, type, tagKey, tagVal, name) {
  return parent && parent.children.find((n) => n.type === type && (stTagOf(n, tagKey) === tagVal || n.name === name));
}

// Khung hiện có của một ô, tìm y như lúc ghi (không tạo gì). target=current: mọi nơi dưới gốc cây (cây mới lẫn bố cục cũ, cell index);
// Cải tiến: Section mode Hiện tại/Cải tiến → vùng Sáng/Tối → nhóm, hoặc container.
function pvFrames(run, t, index) {
  if (index) return index.cells.get(stKey(t.theme, t.screen.id)) || [];
  let parent = null;
  if (!run.sectionMode) {
    const features = stFindPage(run.opts.pageFeatures);
    parent = features && stFindContainer(features, run.target);
  } else {
    const area = pvChild(run.improvedSide, 'SECTION', LOCAL_THEME_KEY, t.theme, t.theme === 'dark' ? 'Tối' : 'Sáng');
    parent = pvChild(area, 'SECTION', 'currentGroupId', t.refGroup && t.refGroup.id, t.refGroup && t.refGroup.name);
  }
  if (!parent) return [];
  stAdoptLegacy(parent, t.screen.id, t.theme); // chỉ gắn lại tag cho khung bản cũ mất tag, đúng như lúc Cập nhật
  return parent.children.filter((n) => n.type === 'FRAME' && stSameCell(n, t.screen.id, t.theme));
}

// args như updateDraft. Trả { summary: { counts, items }, mode, target }.
async function cmdPreviewSync(args) {
  await figma.loadAllPagesAsync();
  const run = localResolveRun(args);
  await stPrepare();
  const themes = stProjectThemes(run.plan);
  const tree = run.target === 'current';
  const root = tree ? trRootOf(run) : null;
  const index = tree ? trIndex(root, run.targets) : null;
  const rows = run.targets.map((t) => {
    const plan = mgPlan(pvFrames(run, t, index), t.screen.raw);
    return {
      action: plan.action, screenId: t.screen.id, theme: t.theme, groupId: t.group.id,
      text: stScreenInfo(t.group, t.screen, t.theme, themes).text,
    };
  });
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

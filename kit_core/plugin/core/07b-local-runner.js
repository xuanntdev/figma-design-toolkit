// Điều phối cục bộ một nút (Cập nhật / Hoàn tác) hỗ trợ cả cây Section (Hiện tại ↔ Cải tiến) lẫn container tự tạo.
// Bảo toàn Hiện tại, màn ngoài phạm vi, bản đã duyệt (status=chosen) và phần chỉnh tay (source=human).

const LOCAL_THEME_KEY = 'riseseed.themeArea';
let LOCAL_LAST_BATCH = null;

function localAllGroups() {
  return stGroups().map((g) => ({
    id: g.id,
    title: g.title,
    order: g.order,
    subtitle: g.subtitle || '',
    screens: g.screens.map((s) => ({
      id: s.id || s.stem,
      stem: s.stem || s.id,
      title: s.title,
      raw: s,
    })),
  }));
}

function localDefaultPlan() {
  if (typeof DRAFT_PLAN !== 'undefined' && DRAFT_PLAN) return DRAFT_PLAN;
  const groups = localAllGroups();
  return {
    screenIds: groups.flatMap((g) => g.screens.map((s) => s.id)),
    themes: ['light', 'dark'],
    replace: true,
  };
}

// Tuỳ chọn hành vi (design-sync.json) mà ui.html cần để hiện/ẩn nút và chọn luồng Cập nhật.
function localSettings() {
  return {
    layout: stLayoutTree() ? 'sections' : 'grid',
    sync: stSyncMerge() ? 'merge' : 'replace',
    preview: stPreviewOn(),
    tokens: tokHookBuilder() ? stTokensMode() : 'off',
  };
}

function localCatalog() {
  return {
    version: PLUGIN_VERSION,
    settings: localSettings(),
    defaultPlan: localDefaultPlan(),
    groups: localAllGroups().map((g) => ({
      id: g.id, title: g.title, subtitle: g.subtitle,
      screens: g.screens.map((s) => ({ id: s.id, title: s.title })),
    })),
  };
}

function localFindSpec(screenId) {
  for (const g of localAllGroups()) {
    const s = g.screens.find((x) => x.id === screenId);
    if (s) return { group: g, screen: s };
  }
  return null;
}

function localIsSide(node, kind, label) {
  return (node.type === 'SECTION' || node.type === 'FRAME')
    && (stTagOf(node, 'kind') === kind || node.name === label);
}

function localFindPage(args, opts) {
  if (args && args.pageId) {
    const p = figma.root.children.find((x) => x.id === args.pageId && x.type === 'PAGE');
    if (p) return p;
  }
  for (const p of figma.root.children) {
    // layout=sections: Section gốc "Hiện tại" bị xoá thì trang đã dựng vẫn nhận ra bằng Section cây của plugin ở cấp trên cùng.
    const hasCur = p.children.some((n) => localIsSide(n, 'current', opts.currentName) || (stLayoutTree() && trIsTree(n)));
    const hasImp = !stImprovedOn() || p.children.some((n) => localIsSide(n, 'improved', opts.improvedName));
    if (hasCur && hasImp) return p;
  }
  return null;
}

function localValidateTargets(currentSide, screenIds, themes, side) {
  if (!screenIds.length) throw new Error('Chưa chọn màn hình nào để cập nhật.');
  if (!themes.length || themes.some((t) => t !== 'light' && t !== 'dark')) {
    throw new Error('Giao diện không hợp lệ (chỉ nhận light hoặc dark).');
  }
  const targets = [];
  for (const id of screenIds) {
    const found = localFindSpec(id);
    if (!found) throw new Error('Mã màn không tồn tại trong extension: ' + id);
    for (const theme of themes) {
      if (currentSide && currentSide.type === 'SECTION' && side !== 'current') {
        const areaName = theme === 'dark' ? 'Tối' : 'Sáng';
        const refArea = currentSide.children.find((n) => n.type === 'SECTION'
          && (stTagOf(n, LOCAL_THEME_KEY) === theme || n.name === areaName));
        if (!refArea) throw new Error('Chưa tìm thấy vùng ' + areaName + ' trong Hiện tại.');
        const refGroup = refArea.children.find((n) => n.type === 'SECTION' && n.name === found.group.title);
        if (!refGroup) throw new Error('Chưa tìm thấy nhóm "' + found.group.title + '" (' + areaName + ') trong Hiện tại.');
        targets.push({ group: found.group, screen: found.screen, theme, refArea, refGroup });
      } else {
        targets.push({ group: found.group, screen: found.screen, theme, containerMode: true });
      }
    }
  }
  return targets;
}

function localSummarizeGroups(proposals) {
  const map = new Map();
  for (const p of proposals || []) {
    if (!map.has(p.groupId)) {
      map.set(p.groupId, { id: p.groupId, title: p.groupTitle, built: 0, reused: 0, keptProtected: 0, themes: new Set() });
    }
    const g = map.get(p.groupId);
    if (p.reused) g.reused += 1;
    else g.built += 1;
    g.keptProtected += p.keptProtected || 0;
    if (p.theme) g.themes.add(p.theme);
  }
  return [...map.values()].map((g) => ({
    id: g.id, title: g.title, built: g.built, reused: g.reused,
    keptProtected: g.keptProtected, themes: [...g.themes],
  }));
}

function localPlaceInSection(improvedSide, target, replace, batchId) {
  const area = localMirrorSection(improvedSide, target.refArea, LOCAL_THEME_KEY, target.theme);
  const group = localMirrorSection(area, target.refGroup, 'currentGroupId', target.refGroup.id);
  const slot = localResolveSlot(group, target.refGroup, target.screen, target.group);
  const same = group.children.filter((n) => n.type === 'FRAME' && stSameCell(n, target.screen.id, target.theme));
  const kept = same.filter(stIsProtected);
  const drafts = same.filter((n) => !kept.includes(n));
  if (!replace && same.length) {
    return {
      groupId: target.group.id, groupTitle: target.group.title, screenId: target.screen.id,
      theme: target.theme, frameId: same[0].id, reused: true, keptProtected: kept.length,
    };
  }
  drafts.forEach((n) => n.remove());
  const frame = stBuildFrame(target.screen.raw, target.theme);
  group.appendChild(frame);
  frame.x = slot.x + kept.length * localStep();
  frame.y = slot.y;
  if (frame.x + frame.width + 60 > group.width) group.resize(frame.x + frame.width + 60, group.height);
  stTag(frame, { screenId: target.screen.id, theme: target.theme, source: 'ai', status: 'draft', variant: kept.length, batchId });
  return {
    groupId: target.group.id, groupTitle: target.group.title, screenId: target.screen.id,
    theme: target.theme, frameId: frame.id, reused: false, replaced: drafts.length, keptProtected: kept.length,
  };
}

// Khung do plugin dựng trong container Hiện tại là ô ảnh (role=cell) để cmdCurrentApply/bố cục nhận ra.
async function localRunContainer(plan, targets, batchId, side) {
  await cmdEnsureLayout(plan);
  const container = await stRequireContainer(plan, side);
  await stPrepare();
  const ext = stExtension();
  const proposals = [];
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    figma.ui.postMessage({ type: 'PLUGIN_PROGRESS', pct: Math.round(((i + 1) / targets.length) * 90), text: 'Đang cập nhật ' + t.screen.title + '…' });
    const tags = Object.assign(stGroupTags(t.group), side === 'current' ? { role: 'cell' } : {});
    const info = stCellInfo(t.group, t.screen, t.theme, stProjectThemes(plan));
    proposals.push(stApplyCell(container, t, { replace: true, batchId, tags, info }));
  }
  await stFinish(ext);
  stampFile();
  await cmdEnsureLayout(plan);
  figma.commitUndo();
  return proposals;
}

// Section mode (layout=grid): target=improved draws into "Cải tiến" mirroring "Hiện tại" (Sáng/Tối → nhóm do designer vẽ);
// target=current draws straight into "Hiện tại" (Sáng/Tối → nhóm → khung).
async function localRunSection(page, sides, targets, plan, batchId) {
  if (figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page);
  await stPrepare();
  await stEnsureFonts();
  const replace = plan.replace !== false;
  const proposals = targets.map((t, idx) => {
    figma.ui.postMessage({ type: 'PLUGIN_PROGRESS', pct: Math.round(((idx + 1) / targets.length) * 92), text: 'Đang cập nhật ' + t.screen.title + '…' });
    return sides.target === 'current'
      ? localPlaceInCurrent(sides.current, t, replace, batchId)
      : localPlaceInSection(sides.improved, t, replace, batchId);
  });
  await stFinish(stExtension());
  stampFile();
  figma.commitUndo();
  return proposals;
}

// Chung cho Xem trước và Cập nhật: plan, đích, đích đến (Section/container) và các ô sẽ xử lý (không ghi gì).
function localResolveRun(args) {
  const plan = Object.assign({}, localDefaultPlan(), args || {});
  const screenIds = [...new Set(plan.screenIds || [])];
  const themes = stFilterThemes([...new Set(plan.themes || ['light', 'dark'])]);
  const opts = stOpts(plan);
  const target = stTarget(plan);
  const page = localFindPage(plan, opts);
  const currentSide = page && page.children.find((n) => localIsSide(n, 'current', opts.currentName));
  const improvedSide = page && stImprovedOn() && page.children.find((n) => localIsSide(n, 'improved', opts.improvedName));
  // layout=sections: Hiện tại là cây Section của plugin, không phải cấu trúc Sáng/Tối để gương sang Cải tiến.
  const sectionMode = !stLayoutTree() && !!(currentSide && currentSide.type === 'SECTION');
  const targets = localValidateTargets(sectionMode ? currentSide : null, screenIds, themes, target);
  return { plan, opts, target, page, currentSide, improvedSide, targets, sectionMode };
}

// Chạy lượt dựng theo chế độ: cây Section (layout=sections, target=current), Section (layout=grid, Hiện tại là Section) hoặc container.
// Trả { proposals, mode, extra }.
async function localRunMode(run, batchId) {
  const { plan, target, targets, sectionMode } = run;
  if (target === 'current' && stLayoutTree()) {
    const r = await localRunTree(run, targets, plan, batchId);
    return { proposals: r.proposals, mode: 'tree', extra: r };
  }
  if (sectionMode) {
    const sides = { current: run.currentSide, improved: run.improvedSide, target };
    return { proposals: await localRunSection(run.page, sides, targets, plan, batchId), mode: 'section', extra: {} };
  }
  return { proposals: await localRunContainer(plan, targets, batchId, target), mode: 'container', extra: {} };
}

async function cmdUpdateDraft(args) {
  assertCanWrite(args);
  await figma.loadAllPagesAsync();
  const run = localResolveRun(args);
  stResetEdited();
  const cleanup = stCleanupOn() ? await stCleanup(run.opts) : { removed: [], kept: [], notes: [] };
  const batchId = 'batch-' + Date.now();
  const { proposals, mode, extra } = await localRunMode(run, batchId);
  const createdIds = proposals.filter((p) => !p.reused).map((p) => p.frameId);
  const groups = localSummarizeGroups(proposals);
  const moves = extra.moves || [];
  if (extra.notes) cleanup.notes.push(...extra.notes);
  if (createdIds.length || moves.length) LOCAL_LAST_BATCH = { batchId, frameIds: createdIds, groups, moves, rootId: extra.rootId };
  return {
    mode, target: run.target, cleanup, editedKept: stEditedCount(),
    proposals, groups, builtCount: createdIds.length, merge: mgSummarize(proposals),
    movedCount: moves.filter((m) => m.frame).length,
    reusedCount: proposals.filter((p) => p.reused).length,
    keptProtected: proposals.reduce((sum, p) => sum + (p.keptProtected || 0), 0),
    batchId,
  };
}

async function cmdRollbackDraft() {
  const batch = LOCAL_LAST_BATCH;
  if (!batch || !(batch.frameIds.length || (batch.moves || []).length)) {
    throw new Error('Chưa có lượt cập nhật nào trong phiên này để hoàn tác.');
  }
  LOCAL_LAST_BATCH = null;
  if (typeof figma.triggerUndo === 'function') {
    figma.triggerUndo();
    return { mode: 'undo', rolledBackCount: batch.frameIds.length, groups: batch.groups || [] };
  }
  let removed = 0;
  for (const id of batch.frameIds) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && stTagOf(node, 'source') === 'ai' && stTagOf(node, 'status') !== 'chosen') {
      const keepId = stTagOf(node, 'conflictOf');
      const keep = keepId ? await figma.getNodeByIdAsync(keepId) : null;
      if (node.parent) stDropLabels(node.parent, node);
      node.remove();
      if (keep && !keep.removed) stClearConflict(keep.parent, keep);
      removed += 1;
    }
  }
  await trRestoreMoves(batch);
  figma.commitUndo();
  return { mode: 'batch', rolledBackCount: removed, groups: batch.groups || [] };
}

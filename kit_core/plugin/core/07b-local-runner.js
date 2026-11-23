// Điều phối cục bộ một nút (Cập nhật / Hoàn tác) hỗ trợ cả cây Section (Hiện tại ↔ Cải tiến) lẫn container tự tạo.
// Bảo toàn Hiện tại, màn ngoài phạm vi, bản đã duyệt (status=chosen) và phần chỉnh tay (source=human).

const LOCAL_THEME_KEY = 'riseseed.themeArea';
let LOCAL_LAST_BATCH = null;

function localAllGroups() {
  return stGroups().map((g) => ({
    id: g.id,
    title: g.title,
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

function localCatalog() {
  return {
    version: PLUGIN_VERSION,
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
    const hasCur = p.children.some((n) => localIsSide(n, 'current', opts.currentName));
    const hasImp = p.children.some((n) => localIsSide(n, 'improved', opts.improvedName));
    if (hasCur && hasImp) return p;
  }
  return null;
}

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
    && (n.name === spec.title || n.name.startsWith(spec.id) || n.name.startsWith(spec.title + ' ·'))) || null;
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
  const frame = stExtension().build(target.screen.raw, target.theme);
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

async function localRunContainer(plan, targets, batchId, side) {
  await cmdEnsureLayout(plan);
  const container = await stRequireContainer(plan, side);
  await stPrepare();
  const ext = stExtension();
  const proposals = [];
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    figma.ui.postMessage({ type: 'PLUGIN_PROGRESS', pct: Math.round(((i + 1) / targets.length) * 90), text: 'Đang cập nhật ' + t.screen.title + '…' });
    const r = stReplaceAi(container, t.screen.id, t.theme);
    const frame = ext.build(t.screen.raw, t.theme);
    container.appendChild(frame);
    stTag(frame, { source: 'ai', status: 'draft', screenId: t.screen.id, theme: t.theme, variant: r.kept, batchId });
    if (side === 'current') stTag(frame, { role: 'cell' });
    proposals.push({
      groupId: t.group.id, groupTitle: t.group.title, screenId: t.screen.id,
      theme: t.theme, frameId: frame.id, reused: false, replaced: r.replaced, keptProtected: r.kept,
    });
  }
  if (ext.finish) await ext.finish();
  stampFile();
  await cmdEnsureLayout(plan);
  figma.commitUndo();
  return proposals;
}

// Section tree: draw into "Cải tiến" mirroring "Hiện tại", or straight into "Hiện tại" when target=current.
async function localRunSection(page, sides, targets, plan, batchId) {
  if (figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page);
  await stPrepare();
  const replace = plan.replace !== false;
  const proposals = targets.map((t, idx) => {
    figma.ui.postMessage({ type: 'PLUGIN_PROGRESS', pct: Math.round(((idx + 1) / targets.length) * 92), text: 'Đang cập nhật ' + t.screen.title + '…' });
    return sides.target === 'current'
      ? localPlaceInCurrent(sides.current, t, replace, batchId)
      : localPlaceInSection(sides.improved, t, replace, batchId);
  });
  if (stExtension().finish) await stExtension().finish();
  stampFile();
  figma.commitUndo();
  return proposals;
}

async function cmdUpdateDraft(args) {
  assertCanWrite(args);
  await figma.loadAllPagesAsync();
  const plan = Object.assign({}, localDefaultPlan(), args || {});
  const screenIds = [...new Set(plan.screenIds || [])];
  const themes = [...new Set(plan.themes || ['light', 'dark'])];
  const opts = stOpts(plan);
  const target = stTarget(plan);
  const page = localFindPage(plan, opts);
  const currentSide = page && page.children.find((n) => localIsSide(n, 'current', opts.currentName));
  const improvedSide = page && page.children.find((n) => localIsSide(n, 'improved', opts.improvedName));
  const targets = localValidateTargets(currentSide, screenIds, themes, target);
  const batchId = 'batch-' + Date.now();
  const sectionMode = !!(currentSide && currentSide.type === 'SECTION');
  const proposals = sectionMode
    ? await localRunSection(page, { current: currentSide, improved: improvedSide, target }, targets, plan, batchId)
    : await localRunContainer(plan, targets, batchId, target);
  const createdIds = proposals.filter((p) => !p.reused).map((p) => p.frameId);
  const groups = localSummarizeGroups(proposals);
  if (createdIds.length) LOCAL_LAST_BATCH = { batchId, frameIds: createdIds, groups };
  return {
    mode: sectionMode ? 'section' : 'container', target,
    proposals, groups, builtCount: createdIds.length,
    reusedCount: proposals.filter((p) => p.reused).length,
    keptProtected: proposals.reduce((sum, p) => sum + (p.keptProtected || 0), 0),
    batchId,
  };
}

async function cmdRollbackDraft() {
  if (!LOCAL_LAST_BATCH || !LOCAL_LAST_BATCH.frameIds.length) {
    throw new Error('Chưa có lượt cập nhật nào trong phiên này để hoàn tác.');
  }
  const batch = LOCAL_LAST_BATCH;
  LOCAL_LAST_BATCH = null;
  if (typeof figma.triggerUndo === 'function') {
    figma.triggerUndo();
    return { mode: 'undo', rolledBackCount: batch.frameIds.length, groups: batch.groups || [] };
  }
  let removed = 0;
  for (const id of batch.frameIds) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && stTagOf(node, 'source') === 'ai' && stTagOf(node, 'status') !== 'chosen') {
      node.remove();
      removed += 1;
    }
  }
  if (removed > 0) figma.commitUndo();
  return { mode: 'batch', rolledBackCount: removed, groups: batch.groups || [] };
}

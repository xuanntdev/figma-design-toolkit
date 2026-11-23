// Pages, the two big containers ("current" / "proposed"), group labels and placeholders. Nodes are labelled
// with plugin data:
//   role = container | cell | label | placeholder, kind = current | improved,
//   source = current | ai | human, status = draft | chosen | dropped | removed | current,
//   screenId, theme, variant.
//
// An extension supplies the product-specific part by defining DESIGN_EXTENSION (see ../README.md):
//   { groups, labels?, prepare?, build(screen, theme), finish? }.

const ST_LABELS = {
  pageFeatures: 'Tính năng',
  pageTokens: 'Token & Component',
  currentName: 'Hiện tại',
  improvedName: 'Cải tiến',
  currentSub: 'Ảnh chụp từ app đang chạy',
  improvedSub: 'Bản đề xuất và thiết kế của nhóm',
  darkSuffix: ' · Tối',
  placeholderCurrent: 'Chưa có ảnh chụp',
  placeholderImproved: 'Chưa có bản đề xuất',
  layoutThemes: ['light', 'dark'],
};

const ST_LEGACY_PAGES = {
  [ST_LABELS.pageFeatures]: 'Features',
  [ST_LABELS.pageTokens]: 'Tokens & Components',
};

function stExtension() {
  if (typeof DESIGN_EXTENSION === 'undefined') {
    throw new Error('Chưa có extension. Hãy dựng plugin với extension có khai báo DESIGN_EXTENSION.');
  }
  return DESIGN_EXTENSION;
}

function stGroups() {
  return stExtension().groups;
}

// Defaults < extension labels < project labels (design-sync.json) < per-call arguments.
function stOpts(args) {
  return Object.assign({}, ST_LABELS, stExtension().labels || {}, stConfig().labels || {}, args || {});
}

// Side that "Cập nhật" draws into: 'improved' (default) or 'current', from design-sync.json or the call.
// design-sync.json `improved: false` removes the "Cải tiến" side: nothing is created, required, read or written there.
function stImprovedOn() {
  return stConfig().improved !== false;
}

function stTarget(args) {
  if (!stImprovedOn()) {
    if (args && args.target === 'improved') throw new Error('Dự án đã tắt khu Cải tiến (improved=false); target chỉ nhận current.');
    return 'current';
  }
  const t = (args && args.target) || stConfig().target || 'improved';
  if (t !== 'improved' && t !== 'current') throw new Error('target chỉ nhận improved hoặc current: ' + t);
  return t;
}

function stTag(node, tags) {
  for (const k of Object.keys(tags)) node.setPluginData(k, String(tags[k]));
}

// A node removed earlier in the same run still sits in lists gathered before the removal: it reads as untagged.
function stTagOf(node, k) {
  if (node.removed) return '';
  return node.getPluginData ? (node.getPluginData(k) || '') : '';
}

function stSolid(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return [{ type: 'SOLID', color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }, opacity: alpha == null ? 1 : alpha }];
}

async function stEnsureFonts() {
  for (const style of ['Regular', 'Medium', 'Semi Bold']) await figma.loadFontAsync({ family: 'Inter', style });
}

function stFindPage(name) {
  const pages = figma.root.children;
  const page = pages.find((candidate) => candidate.name === name);
  const legacyName = ST_LEGACY_PAGES[name];
  if (page || !legacyName) return page;

  // Match old page names only when the file already contains the toolkit's comparison layout.
  const featureNames = [ST_LABELS.pageFeatures, ST_LEGACY_PAGES[ST_LABELS.pageFeatures]];
  const installed = pages.some((candidate) => featureNames.includes(candidate.name) && stFindContainer(candidate, 'current'));
  return installed ? pages.find((candidate) => candidate.name === legacyName) : undefined;
}

async function stEnsurePage(name) {
  await figma.loadAllPagesAsync();
  const page = stFindPage(name) || figma.createPage();
  if (page.name !== name) page.name = name;
  return page;
}

function stFindContainer(page, kind) {
  return page.children.find((c) => stTagOf(c, 'role') === 'container' && stTagOf(c, 'kind') === kind) || null;
}

function stEnsureContainer(page, kind, name) {
  let c = stFindContainer(page, kind);
  if (!c) {
    c = figma.createFrame();
    stTag(c, { role: 'container', kind });
    c.fills = stSolid('#F4F5F7');
    c.cornerRadius = 32;
    c.clipsContent = false;
    page.appendChild(c);
  }
  c.name = name;
  return c;
}

// Frames already in the containers per screen => columns each screen occupies (max over themes). Several frames of one
// cell (a kept edited/chosen one plus a new draft) sit side by side, so the cell takes several columns.
function stSlots(...containers) {
  const perKey = {};
  const slots = {};
  for (const c of containers) {
    if (!c) continue;
    for (const n of c.children) {
      const id = stTagOf(n, 'screenId');
      if (!id || !stTagOf(n, 'source')) continue;
      const key = stKey(stTagOf(n, 'theme') || 'light', id) + '#' + c.id;
      perKey[key] = (perKey[key] || 0) + 1;
      slots[id] = Math.max(slots[id] || 1, perKey[key]);
    }
  }
  return slots;
}

function stIsReal(node, kind) {
  const role = stTagOf(node, 'role');
  const source = stTagOf(node, 'source');
  return kind === 'current' ? role === 'cell' : (source === 'ai' || source === 'human') && !!stTagOf(node, 'screenId');
}

// Puts real cells back on the grid (a screen gaining columns must not push others out of line).
function stReposition(container, layout, kind) {
  const seen = {};
  for (const n of container.children) {
    if (!stIsReal(n, kind)) continue;
    const key = stKey(stTagOf(n, 'theme') || 'light', stTagOf(n, 'screenId'));
    const cell = layout.cells[key];
    if (!cell) continue;
    const variant = seen[key] == null ? 0 : seen[key] + 1;
    seen[key] = variant;
    n.x = stVariantX(cell, variant);
    n.y = cell.y;
    stPlaceLabels(container, n);
    if (kind === 'improved') stTag(n, { variant });
  }
}

function stText(parent, s, size, weight, color, x, y, w) {
  const t = figma.createText();
  t.fontName = { family: 'Inter', style: weight };
  t.fontSize = size;
  t.characters = s;
  t.fills = stSolid(color);
  if (w) {
    t.textAutoResize = 'HEIGHT';
    t.resize(w, t.height);
  }
  t.x = x;
  t.y = y;
  parent.appendChild(t);
  return t;
}

function stPlaceholder(container, cell, text) {
  const f = figma.createFrame();
  const w = cell.span * ST_GRID.cellW + (cell.span - 1) * ST_GRID.gapX;
  f.resize(w, cell.h || ST_GRID.cellH);
  f.name = text + ' · ' + cell.screenId + ' · ' + cell.theme;
  f.fills = stSolid('#FFFFFF', 0.5);
  f.strokes = stSolid('#B8BEC9');
  f.dashPattern = [12, 8];
  f.cornerRadius = 24;
  stTag(f, { role: 'placeholder', screenId: cell.screenId, theme: cell.theme });
  container.appendChild(f);
  f.x = cell.x;
  f.y = cell.y;
  stText(f, text, 18, 'Medium', '#5F6A7C', 24, ST_GRID.cellH / 2 - 12, w - 48).textAlignHorizontal = 'CENTER';
  stText(f, cell.screenId, 14, 'Regular', '#5F6A7C', 24, ST_GRID.cellH / 2 + 16, w - 48).textAlignHorizontal = 'CENTER';
}

// Redraws the title, group labels and placeholders (real cells are never touched).
function stRefreshDecor(container, layout, kind, o) {
  for (const n of container.children.slice()) {
    const role = stTagOf(n, 'role');
    if (role === 'label' || role === 'placeholder') n.remove();
  }
  const title = kind === 'current' ? o.currentName : o.improvedName;
  const sub = kind === 'current' ? o.currentSub : o.improvedSub;
  stTag(stText(container, title, 56, 'Semi Bold', '#141A24', ST_GRID.pad, ST_GRID.pad), { role: 'label' });
  stTag(stText(container, sub, 20, 'Regular', '#5F6A7C', ST_GRID.pad, ST_GRID.pad + 76), { role: 'label' });
  for (const l of layout.labels) {
    const label = l.theme === 'dark' ? l.title + o.darkSuffix : l.title;
    stTag(stText(container, label, 28, 'Semi Bold', '#141A24', l.x, l.y), { role: 'label' });
  }
  const real = {};
  for (const n of container.children) if (stIsReal(n, kind)) real[stKey(stTagOf(n, 'theme') || 'light', stTagOf(n, 'screenId'))] = true;
  const text = kind === 'current' ? o.placeholderCurrent : o.placeholderImproved;
  for (const key of Object.keys(layout.cells)) if (!real[key]) stPlaceholder(container, layout.cells[key], text);
}

async function stSetup(args) {
  const o = stOpts(args);
  await stEnsureFonts();
  const features = await stEnsurePage(o.pageFeatures);
  const tokens = await stEnsurePage(o.pageTokens);
  // layout=sections draws "Hiện tại" as a Section tree, so there is no current container to keep on the grid.
  const current = stLayoutTree() ? null : stEnsureContainer(features, 'current', o.currentName);
  const improved = stImprovedOn() ? stEnsureContainer(features, 'improved', o.improvedName) : null;
  return { o, features, tokens, current, improved };
}

// Real frame height per cell (max over both containers) so rows are as tall as their tallest frame.
function stHeights(current, improved) {
  const heights = {};
  for (const [c, kind] of [[current, 'current'], [improved, 'improved']]) {
    if (!c) continue;
    for (const n of c.children) {
      if (!stIsReal(n, kind)) continue;
      const key = stKey(stTagOf(n, 'theme') || 'light', stTagOf(n, 'screenId'));
      heights[key] = Math.max(heights[key] || 0, n.height);
    }
  }
  return heights;
}

// Builds or refreshes the structure: 2 pages, 1-2 containers, grid, labels, placeholders. Safe to run repeatedly.
async function cmdEnsureLayout(args) {
  const s = await stSetup(args);
  const sides = [s.current, s.improved].filter(Boolean);
  const layout = stComputeLayout(stLayoutGroups(sides), stSlots(s.current, s.improved), stLayoutThemes(s.o), stHeights(s.current, s.improved));
  for (const c of sides) c.resize(layout.width, layout.height);
  if (s.current) {
    s.current.x = 0;
    s.current.y = 0;
    stReposition(s.current, layout, 'current');
    stRefreshDecor(s.current, layout, 'current', s.o);
  }
  if (s.improved) {
    s.improved.x = s.current ? layout.width + ST_GRID.containerGap : stTreeRight(s.features);
    s.improved.y = 0;
    stReposition(s.improved, layout, 'improved');
    stRefreshDecor(s.improved, layout, 'improved', s.o);
  }
  return {
    pages: [s.features.name, s.tokens.name], pageCount: figma.root.children.length,
    current: s.current ? s.current.id : null, improved: s.improved ? s.improved.id : null, width: layout.width, height: layout.height,
    cells: Object.keys(layout.cells).length,
  };
}

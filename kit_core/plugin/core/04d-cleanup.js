// Dọn khu thừa mỗi lượt Cập nhật: khu "Cải tiến" khi improved=false, và vùng/hàng/ô/nhãn của chủ đề không có trong
// DRAFT_PLAN.themes (dự án chỉ light thì bỏ hết phần Tối). Chỉ xoá node do plugin tạo (có tag) và không được bảo vệ
// (source=human, status=chosen); node không tag (designer tự vẽ) và node được bảo vệ luôn giữ lại, khu chứa chúng
// cũng giữ và được báo trong kết quả. Không có DRAFT_PLAN.themes (kit mặc định) thì chủ đề giữ như cũ.

const CL_THEMES = ['light', 'dark'];
const CL_AREA_NAMES = { light: 'Sáng', dark: 'Tối' };
const CL_OURS = ['role', 'kind', 'source', 'screenId', 'currentGroupId', 'groupId', 'labelFor', 'labelScreen'];

// Chủ đề của dự án theo plan nhúng khi build; null = không có plan (giữ mặc định của kit).
function stPlanThemes() {
  const plan = typeof DRAFT_PLAN !== 'undefined' && DRAFT_PLAN;
  return plan && Array.isArray(plan.themes) && plan.themes.length ? plan.themes : null;
}

function stLayoutThemes(o) {
  return stPlanThemes() || o.layoutThemes;
}

// Bỏ chủ đề ngoài plan khỏi danh sách yêu cầu; rỗng thì dùng chủ đề của plan.
function stFilterThemes(themes) {
  const allowed = stPlanThemes();
  if (!allowed) return themes;
  const kept = themes.filter((t) => allowed.includes(t));
  return kept.length ? kept : allowed;
}

// Của plugin: có tag, hoặc Section rỗng / vùng chủ đề (Sáng, Tối) vốn chỉ là vỏ không chứa gì của designer.
function clIsOurs(node) {
  if (CL_OURS.some((k) => stTagOf(node, k)) || !!stTagOf(node, LOCAL_THEME_KEY)) return true;
  return node.type === 'SECTION' && (!(node.children || []).length || Object.values(CL_AREA_NAMES).includes(node.name));
}

// Số khung trong một node giữ lại (node là khung thì 1; Section/nhãn không có khung thì tính 1 để vẫn báo).
function clFrameCount(node) {
  if (node.type === 'FRAME' || !(node.children && node.children.length)) return 1;
  return node.children.reduce((sum, c) => sum + clFrameCount(c), 0);
}

// true nếu node (và phần ruột) xoá được; Section được dọn từng con, khung/nhãn của plugin xoá nguyên khối.
function clPrune(node, st) {
  if (stIsProtected(node, false) || !clIsOurs(node)) {
    st.kept += clFrameCount(node);
    return false;
  }
  return node.type === 'SECTION' ? clPruneChildren(node, st) : true;
}

function clPruneChildren(node, st) {
  let empty = true;
  for (const c of (node.children || []).slice()) {
    if (clPrune(c, st)) c.remove();
    else empty = false;
  }
  return empty;
}

// Xoá một khu (vỏ nhận theo tag/tên): sạch thì xoá luôn vỏ, không thì giữ vỏ + ghi chú.
function clDropShell(node, name, res) {
  const st = { kept: 0 };
  if (clPruneChildren(node, st)) {
    node.remove();
    res.removed.push(name);
    return;
  }
  res.kept.push({ name, count: st.kept });
}

// Vùng chủ đề trong Section: nhận theo tag themeArea, thiếu tag thì theo tên Sáng/Tối.
function clIsThemeArea(node, themes) {
  const t = stTagOf(node, LOCAL_THEME_KEY);
  return node.type === 'SECTION' && (t ? themes.includes(t) : themes.some((x) => CL_AREA_NAMES[x] === node.name));
}

// Container (khung tự tạo): bỏ ô/nhãn/ô giữ chỗ gắn theme bị loại; nhãn của khung còn sống được giữ.
function clDropThemedCells(container, themes, name, res) {
  const st = { kept: 0 };
  const hit = (n) => themes.includes(stTagOf(n, 'theme')) && clIsOurs(n);
  const isLabel = (n) => stTagOf(n, 'role') === 'screenLabel';
  const mine = container.children.filter(hit);
  let removed = 0;
  for (const n of mine.filter((x) => !isLabel(x))) {
    if (clPrune(n, st)) { n.remove(); removed += 1; }
  }
  const alive = new Set(container.children.map((n) => n.id));
  for (const n of mine.filter(isLabel)) {
    if (!alive.has(stTagOf(n, 'labelFor'))) { n.remove(); removed += 1; }
  }
  if (removed) res.removed.push(name);
  if (st.kept) res.kept.push({ name, count: st.kept });
}

function clDropFromSide(side, themes, res) {
  const name = side.name;
  if (side.type === 'SECTION') {
    for (const a of side.children.slice()) {
      if (clIsThemeArea(a, themes)) clDropShell(a, a.name + ' (' + name + ')', res);
    }
  } else {
    clDropThemedCells(side, themes, name, res);
  }
}

// Dọn mọi trang có khu Hiện tại. Trả { removed: [tên khu], kept: [{ name, count }], notes: [câu báo cho UI] }.
async function stCleanup(opts) {
  await stPrepare();
  const res = { removed: [], kept: [], notes: [], pageIds: [] };
  const planThemes = stPlanThemes();
  const dropThemes = planThemes ? CL_THEMES.filter((t) => !planThemes.includes(t)) : [];
  for (const page of figma.root.children) {
    if (liveProtected().has(page.id)) continue;
    if (!page.children.some((n) => localIsSide(n, 'current', opts.currentName))) continue;
    res.pageIds.push(page.id);
    for (const side of page.children.slice()) {
      if (!stImprovedOn() && localIsSide(side, 'improved', opts.improvedName)) clDropShell(side, side.name, res);
      else if (dropThemes.length && localIsSide(side, 'current', opts.currentName)) clDropFromSide(side, dropThemes, res);
      else if (dropThemes.length && localIsSide(side, 'improved', opts.improvedName)) clDropFromSide(side, dropThemes, res);
    }
  }
  for (const k of res.kept) res.notes.push('Giữ lại khu ' + k.name + ' vì có ' + k.count + ' khung do designer tạo.');
  if (res.removed.length) res.notes.unshift('Đã xoá khu thừa: ' + [...new Set(res.removed)].join(', ') + '.');
  return res;
}

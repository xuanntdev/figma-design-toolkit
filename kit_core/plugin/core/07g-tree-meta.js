// Cây Section lồng nhau của khu "Hiện tại" (layout=sections, target=current): các cấp lấy từ design-sync.json `sectionLevels`
// (mặc định khu → nhóm → luồng, bỏ được cấp nào cũng được): Section khu (vd KHU A / KHU B, từ groupOrders[nhóm].area) → Section nhóm
// (title nhóm) → Section luồng (title luồng viết hoa) → khung màn. Khung nằm ở cấp cuối. Nhóm chỉ có một luồng thì cấp luồng gộp vào
// nhóm (`collapseSingleFlow`). Tên Section Figma hiển thị cỡ cố định ở mọi mức zoom nên dùng làm nhãn chính; nhãn text trên khung
// (04c, tuỳ chọn `screenLabels`) là nhãn phụ khi zoom gần. Section do plugin tạo mang tag treeLevel/treeKey.
// Nguồn meta: nhóm (order/title/area/flows) = extension + DRAFT_PLAN.groupOrders; luồng của màn = DRAFT_PLAN.screenFlows.

const TREE = {
  fills: stTreeFills(), // mặc định khu trong suốt (null), nhóm/luồng xanh nhạt; đổi bằng design-sync.json `sectionFills`
  head: { root: 140, area: 140, group: 120, flow: 100 }, // chừa chỗ phía trên cho tên Section
  pad: 60, gap: 80, gapX: 56,
  flowCols: 2, // luồng đầy đủ perRow khung đứng tối đa mấy cột cạnh nhau trong một nhóm (1 = xếp dọc hết, nhóm lớn sẽ rất dài)
  fallback: 'KHÁC', // khu / luồng khi plan không nói
};

function trPlan() {
  return typeof DRAFT_PLAN !== 'undefined' && DRAFT_PLAN ? DRAFT_PLAN : null;
}

// Meta mới nhất của nhóm: { id, order, title, area }. `node` (khung hoặc Section cũ có tag) là nguồn cuối nếu không ai nhận ra nhóm.
function trGroupInfo(id, node) {
  const m = stGroupMeta(id) || {};
  const p = (trPlan() && trPlan().groupOrders && trPlan().groupOrders[id]) || {};
  const order = m.order == null ? p.order : m.order;
  const tagOrder = node ? stTagOf(node, 'groupOrder') : '';
  return {
    id,
    order: order == null && tagOrder !== '' ? Number(tagOrder) : order,
    title: m.title || p.title || (node && (stTagOf(node, 'groupTitle') || node.name)) || id,
    area: p.area || TREE.fallback,
  };
}

// Luồng của màn theo plan; null khi plan không có màn này.
function trFlowOf(stem) {
  const f = trPlan() && trPlan().screenFlows && trPlan().screenFlows[stem];
  return f ? { id: f.id, title: f.title, order: f.order } : null;
}

// Luồng hiện tại của khung (cha là Section luồng); null khi khung ở nơi khác (bố cục cũ, Section nhóm).
function trHintFlow(frame) {
  const p = frame && frame.parent;
  if (!p || p.type !== 'SECTION' || stTagOf(p, 'treeLevel') !== 'flow') return null;
  return { id: stTagOf(p, 'treeKey').split('/').slice(1).join('/'), title: p.name, order: trOrderOf(p) };
}

// Luồng của màn: plan, không có trong plan thì luồng hiện tại của khung (`hint`), thật không biết mới là KHÁC.
function trFlowFor(stem, hint) {
  return trFlowOf(stem) || trHintFlow(hint) || { id: 'khac', title: TREE.fallback, order: 1e9 };
}

// Thứ tự khu = order nhỏ nhất của các nhóm thuộc khu (nhóm trong plan + nhóm của extension).
function trAreaOrder(area) {
  const plan = (trPlan() && trPlan().groupOrders) || {};
  const ids = new Set(Object.keys(plan).concat(stGroups().map((g) => g.id)));
  let min = Infinity;
  for (const id of ids) {
    const g = trGroupInfo(id, null);
    if (g.area === area && typeof g.order === 'number') min = Math.min(min, g.order);
  }
  return min;
}

function trIsTree(n) {
  return n.type === 'SECTION' && !!stTagOf(n, 'treeLevel');
}

// Section cũ của plugin (bố cục trước khi có cây): vùng Sáng/Tối, Section nhóm (groupId / currentGroupId).
function trIsOldSection(n) {
  return n.type === 'SECTION' && (!!stTagOf(n, 'groupId') || !!stTagOf(n, 'currentGroupId') || !!stTagOf(n, LOCAL_THEME_KEY)
    || ['Sáng', 'Tối'].includes(n.name));
}

// Fill mặc định chỉ đặt cho Section plugin tạo (có tag treeFill); Section designer nhận theo tên giữ nguyên màu của họ.
function trStyle(sec, level, fresh) {
  const hex = TREE.fills[level] || 'none';
  const had = stTagOf(sec, 'treeFill');
  if ((fresh || had) && had !== hex) {
    sec.fills = hex === 'none' ? [] : stSolid(hex);
    stTag(sec, { treeFill: hex });
  }
}

// Tìm (theo tag, rồi theo tên trong cùng cha) hoặc tạo Section một cấp; đặt lại tên/thứ tự theo meta mới.
function trSection(parent, level, key, name, order) {
  const kids = parent.children.filter((n) => n.type === 'SECTION');
  let sec = kids.find((n) => stTagOf(n, 'treeLevel') === level && stTagOf(n, 'treeKey') === key);
  if (!sec) sec = kids.find((n) => !stTagOf(n, 'treeLevel') && !trIsOldSection(n) && n.name === name);
  const fresh = !sec;
  if (fresh) {
    sec = figma.createSection();
    parent.appendChild(sec);
    sec.resize(ST_GRID.cellW + 2 * TREE.pad, ST_GRID.cellH + TREE.head[level]);
  }
  sec.name = name;
  stTag(sec, { treeLevel: level, treeKey: key, treeOrder: order == null || order === Infinity ? '' : order });
  trStyle(sec, level, fresh);
  return sec;
}

// Số luồng khác nhau của mỗi nhóm: từ mọi màn của nhóm nhúng, mọi khung của plugin đang có và các ô của lô (cùng đáp số mỗi lượt).
function trFlowCounts(items, targets) {
  const sets = new Map();
  const add = (gid, stem, frame) => {
    if (!sets.has(gid)) sets.set(gid, new Set());
    sets.get(gid).add(trFlowFor(stem, frame).id);
  };
  for (const g of stGroups()) g.screens.forEach((s) => add(g.id, s.stem || s.id));
  for (const { frame, parent } of items) add(trGroupIdOf(frame, parent), stTagOf(frame, 'screenId'), frame);
  for (const t of targets) add(t.group.id, t.screen.id);
  return new Map([...sets].map(([gid, set]) => [gid, set.size]));
}

// Có gộp cấp luồng vào nhóm không: bật `collapseSingleFlow`, cây có cấp nhóm và nhóm chỉ có một luồng.
function trCollapsed(gid, counts) {
  return stSetting('collapseSingleFlow', true) !== false && stTreeLevels().includes('group') && !!counts && counts.get(gid) <= 1;
}

// Section lá của một màn (tạo đủ các cấp của cây dưới `root`); trả { flow, info } hoặc null khi không biết nhóm.
// `hint` = khung đang có của màn: plan không biết màn thì giữ luồng hiện tại của khung.
function trFlowSection(root, gid, stem, groupNode, counts, hint) {
  if (!gid) return null;
  const g = trGroupInfo(gid, groupNode);
  const f = trFlowFor(stem, hint);
  let sec = root;
  for (const level of stTreeLevels()) {
    if (level === 'area') sec = trSection(sec, 'area', g.area, g.area, trAreaOrder(g.area));
    else if (level === 'group') sec = trSection(sec, 'group', gid, g.title, g.order);
    else if (!trCollapsed(gid, counts)) sec = trSection(sec, 'flow', gid + '/' + f.id, f.title, f.order);
  }
  return { flow: sec, info: g };
}

// Mép phải của cây Section trên trang (0 khi chưa có): chỗ đặt khung Cải tiến cạnh cây Hiện tại.
function stTreeRight(page) {
  const mine = page.children.filter((n) => n.type === 'SECTION' && !!stTagOf(n, 'treeLevel'));
  return mine.length ? Math.max(...mine.map((n) => n.x + n.width)) + ST_GRID.containerGap : 0;
}

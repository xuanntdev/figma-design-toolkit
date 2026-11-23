// Cây Section lồng nhau của khu "Hiện tại" (target=current): Section khu (vd KHU A / KHU B, lấy từ groupOrders[nhóm].area) → Section nhóm (title nhóm)
// → Section luồng (title luồng viết hoa) → khung màn. Tên Section Figma hiển thị cỡ cố định ở mọi mức zoom nên dùng làm
// nhãn chính; nhãn text trên khung (04c) là nhãn phụ khi zoom gần. Section do plugin tạo mang tag treeLevel/treeKey.
// Nguồn meta: nhóm (order/title/area/flows) = extension + DRAFT_PLAN.groupOrders; luồng của màn = DRAFT_PLAN.screenFlows.

const TREE = {
  fills: { area: null, group: '#DCEAFB', flow: '#EEF5FE' }, // khu trong suốt (null); nhóm > luồng xanh nhạt
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

function trFlowOf(stem) {
  const f = trPlan() && trPlan().screenFlows && trPlan().screenFlows[stem];
  return f ? { id: f.id, title: f.title, order: f.order } : { id: 'khac', title: TREE.fallback, order: 1e9 };
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

// Section luồng của một màn (tạo đủ khu → nhóm → luồng dưới `root`); trả { flow, info } hoặc null khi không biết nhóm.
function trFlowSection(root, gid, stem, groupNode) {
  if (!gid) return null;
  const g = trGroupInfo(gid, groupNode);
  const f = trFlowOf(stem);
  const area = trSection(root, 'area', g.area, g.area, trAreaOrder(g.area));
  const group = trSection(area, 'group', gid, g.title, g.order);
  return { flow: trSection(group, 'flow', gid + '/' + f.id, f.title, f.order), info: g };
}

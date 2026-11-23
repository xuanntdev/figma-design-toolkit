// Engine link: thử các luật match (extension) cho từng node snapshot -> createInstance + variant / property / override; không khớp thì dựng khối thô.
// link (kết quả của rule.match): { comp: 'key', variant?: {A:'b'}|'A=b', props?: {Label:'x'}, swaps?: {Icon:{comp,variant}},
//   nested?: [{ node:'tên node con', props?, swaps?, visible?, text?, recolor?: 'tên biến màu' }], radius?: số|[4], name?, size?: false (giữ cỡ component) }.
// ctx: { build?, count?(node) -> số node snapshot trong cây con, label?(node) -> nhãn thống kê } do bộ dựng của extension đưa vào.
function lkPropKey(inst, base) {
  return Object.keys(inst.componentProperties || {}).find((k) => k.split('#')[0] === base) || null;
}

function lkSetProps(inst, props) {
  const map = {};
  Object.keys(props || {}).forEach((base) => {
    const k = lkPropKey(inst, base);
    if (k) map[k] = props[base];
  });
  if (Object.keys(map).length) inst.setProperties(map);
}

function lkSwapId(spec) {
  const e = lkFind(spec.comp, spec.variant);
  return e ? e.node.id : null;
}

// Đổi INSTANCE_SWAP: Figma có thể đặt lại tên layer theo component mới, nên giữ tên cũ của node gắn property để luật còn tìm được theo tên.
function lkSetSwaps(inst, swaps) {
  Object.keys(swaps || {}).forEach((base) => {
    const id = lkSwapId(swaps[base]);
    const key = lkPropKey(inst, base);
    if (!id || !key) return;
    const holders = inst.findAll((x) => x.componentPropertyReferences && x.componentPropertyReferences.mainComponent === key);
    const names = holders.map((h) => h.name);
    inst.setProperties({ [key]: id });
    holders.forEach((h, i) => { if (!h.removed) h.name = names[i]; });
  });
}

const LK_VECTORS = ['VECTOR', 'RECTANGLE', 'ELLIPSE', 'LINE', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON'];

// Tô lại mọi hình vector bên trong node (vd icon vừa INSTANCE_SWAP, mất màu override) bằng biến màu theo tên.
function lkRecolor(node, varName) {
  const v = LK.byName[varName];
  if (!v || !figma.variables) return;
  const paint = () => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', v);
  node.findAll((x) => LK_VECTORS.includes(x.type)).forEach((x) => {
    if (Array.isArray(x.fills) && x.fills.length) x.fills = [paint()];
    if (Array.isArray(x.strokes) && x.strokes.length) x.strokes = [paint()];
  });
}

function lkApplyNested(inst, list) {
  for (const spec of list || []) {
    const t = inst.findOne((x) => x.name === spec.node);
    if (!t) continue;
    if (spec.visible !== undefined) t.visible = spec.visible;
    if (spec.text !== undefined && t.type === 'TEXT') t.characters = spec.text;
    if (spec.recolor) lkRecolor(t, spec.recolor);
    if (t.type === 'INSTANCE') {
      lkSetProps(t, spec.props);
      lkSetSwaps(t, spec.swaps);
    }
  }
}

function lkApplyRadius(inst, r) {
  if (r == null) return;
  if (typeof r === 'number') inst.cornerRadius = r;
  else [inst.topLeftRadius, inst.topRightRadius, inst.bottomRightRadius, inst.bottomLeftRadius] = r;
}

function lkBases(node) {
  return Object.keys(node.componentProperties || {}).map((k) => k.split('#')[0]);
}

// Ghi plugin data `lk`: tên property của instance (và của instance lồng) lúc dựng, để vân tay chỉ băm giá trị các property đó
// (component thêm property / đổi ruột không làm khung bị coi là sửa tay).
function lkStamp(inst) {
  const nested = inst.findAll((x) => x.type === 'INSTANCE').map((x) => lkBases(x));
  inst.setPluginData('lk', JSON.stringify({ p: lkBases(inst), n: nested }));
}

function lkInstantiate(parent, n, link) {
  const entry = lkFind(link.comp, link.variant);
  if (!entry) return null;
  const inst = entry.node.createInstance();
  parent.appendChild(inst);
  inst.name = link.name || entry.node.parent.name || link.comp;
  lkSetProps(inst, link.props);
  lkSetSwaps(inst, link.swaps);
  lkApplyNested(inst, link.nested);
  lkApplyRadius(inst, link.radius);
  if (link.size !== false) inst.resize(Math.max(0.01, n.w), Math.max(0.01, n.h));
  inst.x = n.x;
  inst.y = n.y;
  lkStamp(inst);
  return inst;
}

function lkMatch(rule, n, ctx) {
  try {
    return rule.match(n, ctx) || null;
  } catch (err) {
    lkStatError(rule.name);
    return null;
  }
}

function lkTryRules(parent, n, ctx) {
  for (const rule of lkRules()) {
    const link = lkMatch(rule, n, ctx);
    if (!link) continue;
    const inst = lkInstantiate(parent, n, link);
    if (inst) {
      lkStatLinked(rule.name, link, n, ctx);
      return inst;
    }
    lkStatMissing(link.comp);
  }
  return null;
}

// Cổng duy nhất dựng một node: luật khớp -> instance; không khớp -> raw(parent, n, ctx) (khối thô) rồi gắn token. Extension không khai luật / token thì chỉ raw.
function lkLinkOrBuild(parent, n, ctx, raw) {
  if (!lkActive()) return raw(parent, n, ctx);
  if (lkHasComponents()) {
    const hit = lkTryRules(parent, n, ctx);
    if (hit) return hit;
  }
  const node = raw(parent, n, ctx);
  lkStatFallback(n, ctx);
  lkBindNode(node);
  return node;
}

// Luật nhận cả một ĐOẠN anh em liên tiếp (vd thanh phân trang = chữ + mũi tên + số trang + ô chọn): rule.matchRun(list, i, ctx) ->
// { link, span: số node anh em được nuốt, box: {x, y, w, h} } | null. Mọi danh sách con (con của frame, gốc màn) dựng qua lkBuildChildren.
function lkMatchRun(rule, list, i, ctx) {
  try {
    return rule.matchRun(list, i, ctx) || null;
  } catch (err) {
    lkStatError(rule.name);
    return null;
  }
}

function lkTryRuns(parent, list, i, ctx) {
  for (const rule of lkRules()) {
    if (!rule.matchRun || !lkHasComponents()) continue;
    const run = lkMatchRun(rule, list, i, ctx);
    if (!run) continue;
    const inst = lkInstantiate(parent, run.box, run.link);
    if (!inst) {
      lkStatMissing(run.link.comp);
      continue;
    }
    lkStatRun(rule.name, run.link, list.slice(i, i + run.span), ctx);
    return run.span;
  }
  return 0;
}

function lkBuildChildren(parent, list, ctx, raw) {
  let i = 0;
  while (i < list.length) {
    const span = lkActive() ? lkTryRuns(parent, list, i, ctx) : 0;
    if (span) i += span;
    else lkLinkOrBuild(parent, list[i++], ctx, raw);
  }
}

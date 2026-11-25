// Chiều ngược Figma -> repo (1/3): nén một node thành JSON gọn cho AI đọc. THUẦN ĐỌC: không ghi node, không đổi trang, không commitUndo.
// Khoá: t loại · n tên · x y w h · fills/strokes [{c, a?, var?}] · r bo góc (rv = biến) · sw độ dày viền · lm H|V gap pad · vars {trường: biến}
//       chữ: chars font size style(text style) · INSTANCE: main set variant props texts nested overridden (KHÔNG đọc ruột instance).
// ctx = { vars: Map id -> tên biến, styles: Map id -> tên text style, names: Map id -> tên node, budget: { left } }.

const RS_TEXT_CAP = 40;
const RS_NESTED_CAP = 30;

function rsRound(v) {
  return Math.round(v * 100) / 100;
}

function rsPaint(p, ctx) {
  if (p.visible === false) return null;
  if (p.type !== 'SOLID' || !p.color) return { type: p.type };
  const out = { c: toHex(p.color) };
  if (p.opacity != null && p.opacity < 1) out.a = rsRound(p.opacity);
  const alias = p.boundVariables && p.boundVariables.color;
  if (alias && ctx.vars.get(alias.id)) out.var = ctx.vars.get(alias.id);
  return out;
}

function rsPaints(list, ctx) {
  if (isMixed(list)) return 'mixed';
  if (!Array.isArray(list)) return undefined;
  const out = list.map((p) => rsPaint(p, ctx)).filter(Boolean);
  return out.length ? out : undefined;
}

function rsGeom(node) {
  const out = {};
  for (const [k, f] of [['x', 'x'], ['y', 'y'], ['w', 'width'], ['h', 'height']]) {
    if (typeof node[f] === 'number') out[k] = rsRound(node[f]);
  }
  return out;
}

// Biến gắn vào các trường không phải paint (khoảng cách, bo góc, cỡ chữ...): { trường: tên biến }.
function rsBoundVars(node, ctx) {
  const out = {};
  const bv = node.boundVariables || {};
  for (const k of Object.keys(bv)) {
    const a = k === 'fills' || k === 'strokes' ? null : bv[k];
    const alias = Array.isArray(a) ? a[0] : a;
    if (alias && ctx.vars.get(alias.id)) out[k] = ctx.vars.get(alias.id);
  }
  return out;
}

function rsLook(node, ctx, out) {
  const fills = 'fills' in node ? rsPaints(node.fills, ctx) : undefined;
  if (fills) out.fills = fills;
  const strokes = 'strokes' in node ? rsPaints(node.strokes, ctx) : undefined;
  if (strokes) {
    out.strokes = strokes;
    if (typeof node.strokeWeight === 'number') out.sw = node.strokeWeight;
  }
  if (typeof node.cornerRadius === 'number' && node.cornerRadius) out.r = node.cornerRadius;
  const vars = rsBoundVars(node, ctx);
  if (Object.keys(vars).length) out.vars = vars;
  if (node.visible === false) out.hidden = true;
}

function rsLayout(node, out) {
  if (!node.layoutMode || node.layoutMode === 'NONE') return;
  out.lm = node.layoutMode === 'HORIZONTAL' ? 'H' : 'V';
  out.gap = node.itemSpacing;
  const pad = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft];
  if (pad.some((v) => v)) out.pad = pad.map((v) => v || 0);
}

function rsText(node, ctx, out) {
  if (node.type !== 'TEXT') return;
  out.chars = node.characters;
  if (node.fontName && !isMixed(node.fontName)) {
    out.font = node.fontName.family + ' ' + node.fontName.style;
    out.fontName = node.fontName;
  }
  if (typeof node.fontSize === 'number') out.size = node.fontSize;
  const style = typeof node.textStyleId === 'string' ? ctx.styles.get(node.textStyleId) : '';
  if (style) out.style = style;
}

// Tên node theo id (cache): dùng cho INSTANCE_SWAP; không tìm được thì giữ id.
async function rsNameOf(id, ctx) {
  if (typeof id !== 'string' || !id) return id;
  if (!ctx.names.has(id)) {
    let n = null;
    try { n = await figma.getNodeByIdAsync(id); } catch (err) { n = null; }
    ctx.names.set(id, n ? n.name : id);
  }
  return ctx.names.get(id);
}

// Property của instance: VARIANT riêng, còn lại (TEXT/BOOLEAN/INSTANCE_SWAP) vào props; khoá bỏ hậu tố "#id".
async function rsProps(cp, ctx) {
  const variant = {};
  const props = {};
  for (const k of Object.keys(cp || {})) {
    const base = k.split('#')[0];
    const p = cp[k];
    if (p.type === 'VARIANT') variant[base] = p.value;
    else props[base] = p.type === 'INSTANCE_SWAP' ? await rsNameOf(p.value, ctx) : p.value;
  }
  return { variant, props };
}

async function rsMain(node) {
  if (typeof node.getMainComponentAsync !== 'function') return null;
  try { return await node.getMainComponentAsync(); } catch (err) { return null; }
}

// withMain=false (instance lồng nhau): bỏ getMainComponentAsync (mỗi lệnh là một lượt gọi bất đồng bộ, hàng chục nghìn lượt trên file lớn); tên + variant + property đủ nhận ra.
async function rsInstanceHead(node, ctx, out, withMain) {
  const main = withMain ? await rsMain(node) : null;
  if (main) {
    out.main = main.name;
    out.componentId = main.id;
    if (main.parent && main.parent.type === 'COMPONENT_SET') out.set = main.parent.name;
  }
  if (withMain && node.componentProperties) out.componentProperties = node.componentProperties;
  const p = await rsProps(node.componentProperties, ctx);
  if (Object.keys(p.variant).length) out.variant = p.variant;
  if (Object.keys(p.props).length) out.props = p.props;
}

// Instance: chỉ component + property + chữ hiển thị + instance lồng nhau (component/biến thể/property), không đi sâu vào ruột.
async function rsInstance(node, ctx, out) {
  await rsInstanceHead(node, ctx, out, true);
  const texts = node.findAll((n) => n.type === 'TEXT').map((n) => n.characters).slice(0, RS_TEXT_CAP);
  if (texts.length) out.texts = texts;
  const nested = [];
  for (const n of node.findAll((x) => x.type === 'INSTANCE').slice(0, RS_NESTED_CAP)) {
    const row = { n: n.name };
    await rsInstanceHead(n, ctx, row, false);
    nested.push(row);
  }
  if (nested.length) out.nested = nested;
  const fields = new Set();
  for (const o of Array.isArray(node.overrides) ? node.overrides : []) (o.overriddenFields || []).forEach((f) => fields.add(f));
  if (fields.size) out.overridden = [...fields].sort();
}

async function rsNode(node, ctx, depth) {
  ctx.budget.left -= 1;
  const out = Object.assign({ id: node.id, t: node.type, n: node.name }, rsGeom(node));
  for (const key of ['textStyleId', 'fillStyleId', 'strokeStyleId', 'effectStyleId']) {
    if (typeof node[key] === 'string' && node[key]) out[key] = node[key];
  }
  rsLook(node, ctx, out);
  rsLayout(node, out);
  rsText(node, ctx, out);
  rsDesign(node, ctx, out);
  if (node.type === 'INSTANCE') {
    await rsInstance(node, ctx, out);
    return out;
  }
  const kids = (node.children || []).filter((k) => !k.removed);
  if (!kids.length) return out;
  if (depth <= 0 || ctx.budget.left <= 0) {
    out.truncated = kids.length;
    return out;
  }
  out.c = [];
  for (const k of kids) {
    if (ctx.budget.left <= 0) {
      out.truncated = kids.length - out.c.length;
      break;
    }
    out.c.push(await rsNode(k, ctx, depth - 1));
  }
  return out;
}

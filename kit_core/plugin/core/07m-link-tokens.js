// Engine link: gắn token cho khối thô theo bảng tra (DESIGN_EXTENSION.linkTokens): fill / stroke / màu chữ khớp hex -> biến Color,
// bo góc khớp số -> biến Radius, chữ khớp (family, style, cỡ, line-height px) -> text style. Không khớp giữ giá trị thô và thống kê.
// Text style áp bất đồng bộ (setTextStyleIdAsync) ở lkFlush cuối lượt; giá trị thuộc tính đã bằng style nên hình học không đổi.
const LK_CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'];

function lkHex2(v) {
  return Math.round(v * 255).toString(16).padStart(2, '0');
}

function lkPaintKey(p) {
  return lkColorKey('#' + lkHex2(p.color.r) + lkHex2(p.color.g) + lkHex2(p.color.b), p.opacity);
}

function lkBindPaints(node, field, role) {
  const list = node[field];
  if (!Array.isArray(list) || !list.length || !LK.tables) return;
  let changed = false;
  const out = list.map((p) => {
    if (p.type !== 'SOLID' || !p.color || p.visible === false || (p.boundVariables && p.boundVariables.color)) return p;
    const key = lkPaintKey(p);
    const v = LK.tables[role].get(key);
    lkStatToken(role, !!v);
    if (!v) lkStatMiss(role, key);
    if (!v) return p;
    changed = true;
    return figma.variables.setBoundVariableForPaint(Object.assign({}, p, { opacity: 1 }), 'color', v);
  });
  if (changed) node[field] = out;
}

function lkBindRadius(node) {
  const r = node.cornerRadius;
  if (typeof r !== 'number' || r <= 0 || !node.setBoundVariable || !LK.tables) return;
  const v = LK.tables.radius.get(String(r));
  lkStatToken('radius', !!v);
  if (!v) return;
  LK_CORNERS.forEach((f) => {
    try { node.setBoundVariable(f, v); } catch (e) { /* trường không bind được: giữ số thô */ }
  });
}

function lkBindTextStyle(t) {
  const lh = t.lineHeight;
  const plain = lh && lh.unit === 'PIXELS' && !(t.letterSpacing && t.letterSpacing.value);
  const style = plain && t.fontName ? LK.tables.textKey.get(lkTextKey(t.fontName.family, t.fontName.style, t.fontSize, lh.value)) : null;
  lkStatToken('textStyle', !!style);
  if (!style && t.fontName) lkStatMiss('textStyle', lkTextKey(t.fontName.family, t.fontName.style, t.fontSize, lh && lh.value));
  if (style) LK.pending.push([t, style]);
}

// Gắn token cho đúng node vừa dựng thô (con đã đi qua engine riêng).
function lkBindNode(node) {
  if (!LK.tables || !node) return;
  if (node.type === 'TEXT') {
    lkBindPaints(node, 'fills', 'text');
    lkBindTextStyle(node);
    return;
  }
  lkBindPaints(node, 'fills', 'fill');
  lkBindPaints(node, 'strokes', 'stroke');
  lkBindRadius(node);
}

async function lkFlush() {
  const list = LK.pending.splice(0);
  for (const [t, style] of list) {
    if (t.removed || !t.setTextStyleIdAsync) continue;
    try { await t.setTextStyleIdAsync(style.id); } catch (e) { lkStatToken('textStyleFail', false); }
  }
}

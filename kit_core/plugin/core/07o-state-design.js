// Thuộc tính dựng/sửa giao diện bổ sung cho cây đọc (rsNode): kích thước fill/hug, căn trục auto layout, bóng, viền chi tiết, chữ, tên style.
// Chỉ ghi khi khác mặc định của Figma để cây gọn. THUẦN ĐỌC.

const RS_DESIGN_SKIP = {
  layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'MIN',
  layoutWrap: 'NO_WRAP', layoutPositioning: 'AUTO', opacity: 1, rotation: 0, strokeAlign: 'INSIDE', textAlignHorizontal: 'LEFT',
  textCase: 'ORIGINAL', textDecoration: 'NONE', textTruncation: 'DISABLED',
};
const RS_DESIGN_KEYS = Object.keys(RS_DESIGN_SKIP).concat(['maxLines', 'clipsContent']);

function rsDesignRead(node, key) {
  if (!(key in node)) return undefined;
  try { return node[key]; } catch (err) { return undefined; }
}

function rsDesignPlain(node, out) {
  for (const k of RS_DESIGN_KEYS) {
    const v = rsDesignRead(node, k);
    if (v === undefined || v === null || isMixed(v) || v === RS_DESIGN_SKIP[k] || (k === 'clipsContent' && !v)) continue;
    out[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
  }
  if (out.layoutWrap === 'WRAP' && typeof node.counterAxisSpacing === 'number') out.counterAxisSpacing = node.counterAxisSpacing;
}

function rsEffects(node) {
  const list = rsDesignRead(node, 'effects');
  if (!Array.isArray(list)) return undefined;
  const out = list.filter((e) => e.visible !== false).map((e) => {
    const row = { type: e.type, radius: e.radius };
    if (e.color) row.color = rsColorKey(e.color);
    if (e.offset) row.offset = [e.offset.x, e.offset.y];
    if (e.spread) row.spread = e.spread;
    return row;
  });
  return out.length ? out : undefined;
}

function rsStroke(node, out) {
  if (!out.strokes) return;
  if (isMixed(rsDesignRead(node, 'strokeWeight'))) {
    out.sw = ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'].map((k) => rsDesignRead(node, k) || 0);
  }
  const dash = rsDesignRead(node, 'dashPattern');
  if (Array.isArray(dash) && dash.length) out.dash = dash;
}

function rsTextDesign(node, out) {
  if (node.type !== 'TEXT') return;
  const lh = rsDesignRead(node, 'lineHeight');
  if (lh && !isMixed(lh) && lh.unit !== 'AUTO') out.lh = lh.unit === 'PERCENT' ? lh.value + '%' : lh.value;
  const ls = rsDesignRead(node, 'letterSpacing');
  if (ls && !isMixed(ls) && ls.value) out.ls = ls.unit === 'PERCENT' ? ls.value + '%' : ls.value;
}

// Tên style màu/viền/bóng (style cục bộ) để AI dùng đúng token thay vì mã màu thô.
function rsStyleNames(node, ctx, out) {
  const names = {};
  for (const [key, label] of [['fillStyleId', 'fill'], ['strokeStyleId', 'stroke'], ['effectStyleId', 'effect']]) {
    const id = rsDesignRead(node, key);
    if (typeof id === 'string' && id && ctx.styles.has(id)) names[label] = ctx.styles.get(id);
  }
  if (Object.keys(names).length) out.styles = names;
}

function rsDesign(node, ctx, out) {
  rsDesignPlain(node, out);
  const effects = rsEffects(node);
  if (effects) out.effects = effects;
  if (isMixed(rsDesignRead(node, 'cornerRadius'))) {
    out.radii = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'].map((k) => rsDesignRead(node, k) || 0);
  }
  rsStroke(node, out);
  rsTextDesign(node, out);
  rsStyleNames(node, ctx, out);
}

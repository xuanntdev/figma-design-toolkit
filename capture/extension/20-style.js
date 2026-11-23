// Áp nền / viền / bo góc / bóng / độ mờ từ snapshot lên frame (hex + alpha -> paint Figma).
function snapPaint(hex, alpha) {
  return stSolid(hex, alpha == null ? 1 : alpha);
}

function snapRadius(node, r) {
  if (r == null) return;
  if (typeof r === 'number') {
    node.cornerRadius = r;
    return;
  }
  node.topLeftRadius = r[0];
  node.topRightRadius = r[1];
  node.bottomRightRadius = r[2];
  node.bottomLeftRadius = r[3];
}

function snapShadow(s) {
  const c = snapPaint(s.c, s.a)[0];
  return {
    type: 'DROP_SHADOW', color: { r: c.color.r, g: c.color.g, b: c.color.b, a: s.a == null ? 1 : s.a },
    offset: { x: s.x, y: s.y }, radius: Math.max(0, s.b), spread: s.s || 0, visible: true, blendMode: 'NORMAL',
  };
}

function snapStyleFrame(frame, n) {
  frame.fills = n.bg ? snapPaint(n.bg, n.ba) : [];
  snapRadius(frame, n.r);
  if (n.bd) {
    frame.strokes = snapPaint(n.bd.c, n.bd.a);
    frame.strokeWeight = n.bd.w;
    frame.strokeAlign = 'INSIDE';
    if (n.bd.d) frame.dashPattern = [4, 4];
  }
  if (n.sh) frame.effects = n.sh.map(snapShadow);
  if (n.o != null) frame.opacity = n.o;
  frame.clipsContent = !!n.cl;
}

function snapSize(node, w, h) {
  node.resize(Math.max(0.01, w), Math.max(0.01, h));
}

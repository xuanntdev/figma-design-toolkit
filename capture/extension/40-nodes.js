// Dựng node từ snapshot: frame (nền/viền/bo/bóng/clip), text, svg (icon), ảnh. Toạ độ tuyệt đối so với node cha.
// createNodeFromSvg chậm: dựng 1 bản mẫu cho mỗi icon rồi clone cho các lần lặp; snapFinish() dọn bản mẫu.
const SNAP_SVG_PROTOS = {};

function snapSvgNode(snap, n) {
  const key = snap.id + ':' + n.v;
  if (SNAP_SVG_PROTOS[key] === undefined) {
    try {
      SNAP_SVG_PROTOS[key] = figma.createNodeFromSvg(snap.svgs[n.v]);
      SNAP_SVG_PROTOS[key].name = 'snap-svg-proto';
    } catch (e) {
      SNAP_SVG_PROTOS[key] = false;
    }
  }
  return SNAP_SVG_PROTOS[key] ? SNAP_SVG_PROTOS[key].clone() : null;
}

function snapFinish() {
  for (const key of Object.keys(SNAP_SVG_PROTOS)) {
    if (SNAP_SVG_PROTOS[key]) SNAP_SVG_PROTOS[key].remove();
    delete SNAP_SVG_PROTOS[key];
  }
}

function snapSvg(parent, n, snap) {
  const node = snapSvgNode(snap, n);
  if (!node) return snapBox(parent, Object.assign({}, n, { bg: '#E5E7EB', ba: 0.6 }));
  parent.appendChild(node);
  node.name = n.n || 'icon';
  if (Math.abs(node.width - n.w) > 0.5 || Math.abs(node.height - n.h) > 0.5) node.resize(Math.max(0.01, n.w), Math.max(0.01, n.h));
  node.x = n.x;
  node.y = n.y;
  return node;
}

function snapImage(parent, n, snap) {
  const rect = figma.createRectangle();
  parent.appendChild(rect);
  rect.name = n.n || 'image';
  snapSize(rect, n.w, n.h);
  rect.x = n.x;
  rect.y = n.y;
  try {
    const b64 = snap.imgs[n.v].split(',')[1];
    const image = figma.createImage(figma.base64Decode(b64));
    rect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
  } catch (e) {
    rect.fills = snapPaint('#E5E7EB');
  }
  return rect;
}

function snapBox(parent, n) {
  const f = figma.createFrame();
  parent.appendChild(f);
  f.name = n.n || 'box';
  snapSize(f, n.w, n.h);
  f.x = n.x;
  f.y = n.y;
  snapStyleFrame(f, n);
  return f;
}

function snapFrame(parent, n, snap) {
  const f = snapBox(parent, n);
  for (const c of n.c || []) snapNode(f, c, snap);
  return f;
}

function snapNode(parent, n, snap) {
  if (n.k === 't') return snapText(parent, n);
  if (n.k === 's') return snapSvg(parent, n, snap);
  if (n.k === 'i') return snapImage(parent, n, snap);
  return snapFrame(parent, n, snap);
}

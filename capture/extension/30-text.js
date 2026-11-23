// Text node sửa được. Một dòng: tự co theo chữ (căn theo trái/giữa/phải so với khung gốc); nhiều dòng: rộng cố định + cao tự co.
function snapTextAlign(a) {
  return { c: 'CENTER', r: 'RIGHT', l: 'LEFT' }[a] || 'LEFT';
}

function snapTextBase(t, n) {
  t.fontName = snapFont(n.f, n.fw, n.it);
  t.fontSize = n.fs;
  t.characters = n.s;
  t.fills = snapPaint(n.col, n.ca);
  if (n.ls) t.letterSpacing = { value: n.ls, unit: 'PIXELS' };
  if (n.ul) t.textDecoration = 'UNDERLINE';
  else if (n.st) t.textDecoration = 'STRIKETHROUGH';
  t.textAlignHorizontal = snapTextAlign(n.a);
}

function snapTextSingle(t, n) {
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  const w = t.width;
  const h = t.height;
  t.x = n.a === 'c' ? n.x + (n.w - w) / 2 : (n.a === 'r' ? n.x + n.w - w : n.x);
  t.y = n.y + (n.h - h) / 2;
}

function snapTextEllipsis(t, n) {
  t.textAutoResize = 'NONE';
  t.textTruncation = 'ENDING';
  t.maxLines = 1;
  t.resize(Math.max(1, n.w), Math.max(n.fs, n.h));
  t.x = n.x;
  t.y = n.y + (n.h - t.height) / 2;
}

function snapTextMulti(t, n) {
  t.lineHeight = { value: n.lh, unit: 'PIXELS' };
  t.textAutoResize = 'HEIGHT';
  t.resize(n.w + 2, t.height);
  t.x = n.x;
  t.y = n.y - (n.lh - n.fs * 1.15) / 2;
}

function snapText(parent, n) {
  const t = figma.createText();
  parent.appendChild(t);
  snapTextBase(t, n);
  t.name = n.s.length > 40 ? n.s.slice(0, 40) : n.s;
  if (n.ml) snapTextMulti(t, n);
  else if (n.el) snapTextEllipsis(t, n);
  else snapTextSingle(t, n);
  return t;
}

// Tiện ích dùng chung cho các kiểm thử cây Section (Figma giả): duyệt cây, tìm Section theo cấp/tên, khung theo màn, va chạm.
const all = (node) => node.children.flatMap((c) => [c, ...all(c)]);
const tag = (n, k) => n.getPluginData(k);
const levelOf = (root, level) => all(root).filter((n) => n.type === 'SECTION' && tag(n, 'treeLevel') === level);
const named = (parent, name) => parent.children.find((n) => n.type === 'SECTION' && n.name === name);
const grid = (n) => n.children.filter((c) => c.type === 'FRAME' && tag(c, 'screenId')).sort((a, b) => (a.y - b.y) || (a.x - b.x));
const frameOf = (root, id) => all(root).filter((n) => n.type === 'FRAME' && tag(n, 'screenId') === id);
const labelsOf = (parent, f) => parent.children.filter((n) => n.type === 'TEXT' && tag(n, 'labelFor') === f.id);
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Mô tả cây khu → nhóm → luồng (tên Section, theo thứ tự trên canvas: y rồi x) để so sánh bằng deepEqual.
function shape(root) {
  const sorted = (list) => list.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const sec = (n) => sorted(n.children.filter((c) => c.type === 'SECTION'));
  return sec(root).map((a) => [a.name, sec(a).map((g) => [g.name, sec(g).map((f) => [f.name, grid(f).map((x) => tag(x, 'screenId'))])])]);
}

// Mọi Section kề nhau không đè, và mỗi Section ôm đúng nội dung (rộng/cao = mép xa nhất + pad), dưới root.
function checkHug(root, pad) {
  for (const s of all(root).filter((n) => n.type === 'SECTION')) {
    const kids = s.children;
    if (!kids.length) continue;
    const w = Math.max(...kids.map((c) => c.x + c.width)) + pad;
    const h = Math.max(...kids.map((c) => c.y + c.height)) + pad;
    if (['area', 'group', 'flow'].includes(tag(s, 'treeLevel')) && (Math.round(w) !== Math.round(s.width) || Math.round(h) !== Math.round(s.height))) {
      throw new Error(`Section ${s.name} không ôm nội dung: ${s.width}x${s.height} vs ${w}x${h}`);
    }
    const sibs = kids.filter((c) => c.type === 'SECTION' || c.type === 'FRAME');
    for (let i = 0; i < sibs.length; i += 1) {
      for (let j = i + 1; j < sibs.length; j += 1) if (overlap(sibs[i], sibs[j])) throw new Error(`Đè nhau trong ${s.name}: ${sibs[i].name} / ${sibs[j].name}`);
    }
  }
}

module.exports = { all, tag, levelOf, named, grid, frameOf, labelsOf, overlap, shape, checkHug };

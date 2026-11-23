// Bố cục cây Section "Hiện tại" (các cấp theo `sectionLevels`), dựng lại mỗi lượt cho MỌI Section của plugin (kể cả nhóm ngoài lô build),
// từ trong ra ngoài (Section lá giữ khung màn; Section còn Section con thì xếp con, chồng/kệ tuỳ cấp con):
//  - luồng: khung màn xếp lưới `perRow` cột, hàng cao bằng khung cao nhất (+ chỗ cho nhãn); các khung cùng một màn (bản sửa tay
//    + bản mới / cặp xung đột) luôn nằm cạnh nhau trong cùng hàng; node lạ của designer giữ chỗ, lưới bắt đầu bên dưới chúng;
//  - Section cha của các luồng: luồng theo order luồng, xếp "kệ" trái→phải rồi xuống hàng khi hết bề rộng TREE.flowCols luồng đầy
//    đủ perRow khung (luồng ngắn đứng cạnh nhau, nhóm 70+ màn rộng 2 cột nên không dài một chiều); cha của khu/nhóm: xếp dọc theo order;
//    gốc: các Section cấp đầu xếp dọc theo order.
// Section của plugin ôm sát nội dung (co và giãn theo + padding); Section gốc "Hiện tại" của designer chỉ giãn.

function trOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function trOrderOf(n) {
  const o = stTagOf(n, 'treeOrder');
  return o === '' ? Infinity : Number(o);
}

function trSorted(list) {
  return list.slice().sort((a, b) => (trOrderOf(a) - trOrderOf(b)) || (stTagOf(a, 'treeKey') < stTagOf(b, 'treeKey') ? -1 : 1));
}

function trBottom(nodes) {
  return Math.max(...nodes.map((n) => n.y + n.height));
}

function trFit(sec, exact) {
  let w = 0;
  let h = 0;
  for (const c of sec.children) {
    w = Math.max(w, c.x + c.width);
    h = Math.max(h, c.y + c.height);
  }
  w += TREE.pad;
  h += TREE.pad;
  if (!exact) {
    w = Math.max(w, sec.width);
    h = Math.max(h, sec.height);
  }
  if (Math.round(w) !== Math.round(sec.width) || Math.round(h) !== Math.round(sec.height)) sec.resize(w, h);
}

// Thứ hạng màn trong nhóm: theo group.json khi nhóm nhúng, màn lạ xếp sau theo vị trí hiện tại (ổn định giữa các lượt).
function trStemRank(gid, frames) {
  const spec = stGroups().find((g) => g.id === gid);
  const rank = new Map();
  if (spec) spec.screens.forEach((s, i) => rank.set(s.stem || s.id, i));
  frames.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x)).forEach((f) => {
    const stem = stTagOf(f, 'screenId');
    if (!rank.has(stem)) rank.set(stem, rank.size + 1e6);
  });
  return rank;
}

// Các khung cùng màn thành một đơn vị: bản sửa tay/đã duyệt trước, bản nháp sau, theo chủ đề.
function trUnits(sec, frames) {
  const rank = trStemRank(stTagOf(sec, 'treeKey').split('/')[0], frames);
  const held = (f) => (stTagOf(f, 'source') === 'human' || stTagOf(f, 'status') === 'chosen' ? 0 : 1);
  const key = (f) => [rank.get(stTagOf(f, 'screenId')), stTagOf(f, 'theme') === 'dark' ? 1 : 0, held(f), f.y, f.x];
  frames = frames.slice().sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const i = ka.findIndex((v, n) => v !== kb[n]);
    return i < 0 ? 0 : ka[i] - kb[i];
  });
  const units = [];
  for (const f of frames) {
    const last = units[units.length - 1];
    if (last && last.stem === stTagOf(f, 'screenId')) last.frames.push(f);
    else units.push({ stem: stTagOf(f, 'screenId'), frames: [f] });
  }
  return units;
}

function trRows(units) {
  const rows = [[]];
  let used = 0;
  for (const u of units) {
    const span = Math.min(ST_GRID.perRow, u.frames.length);
    if (used > 0 && used + span > ST_GRID.perRow) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(u);
    used += span;
  }
  return rows.filter((r) => r.length);
}

function trReflowFlow(sec) {
  const grid = sec.children.filter(trGridFrame);
  const foreign = sec.children.filter((n) => !trGridFrame(n) && stTagOf(n, 'role') !== 'screenLabel');
  let y = foreign.length ? trBottom(foreign) + ST_GRID.gapY : (TREE.head[stTagOf(sec, 'treeLevel')] || TREE.head.flow);
  for (const row of trRows(trUnits(sec, grid))) {
    const frames = row.flatMap((u) => u.frames);
    const room = Math.max(...frames.map((f) => (stLabelsOf(sec, f).length ? ST_GRID.labelH : 0)));
    let x = TREE.pad;
    for (const f of frames) {
      f.x = x;
      f.y = y + room;
      stPlaceLabels(sec, f);
      x += f.width + TREE.gapX;
    }
    y += room + Math.max(...frames.map((f) => f.height)) + ST_GRID.gapY;
  }
  trFit(sec, true);
}

// Bề rộng một luồng đầy đủ perRow khung; một hàng luồng trong nhóm rộng tối đa flowCols luồng như vậy.
function trRowWidth() {
  const full = 2 * TREE.pad + ST_GRID.perRow * ST_GRID.cellW + (ST_GRID.perRow - 1) * TREE.gapX;
  return TREE.flowCols * full + (TREE.flowCols - 1) * TREE.gap;
}

function trPackFlows(sec) {
  const flows = trSorted(sec.children.filter(trIsTree));
  const foreign = sec.children.filter((n) => !trIsTree(n));
  let y = foreign.length ? trBottom(foreign) + TREE.gap : TREE.head[stTagOf(sec, 'treeLevel')];
  let x = TREE.pad;
  let rowH = 0;
  for (const f of flows) {
    if (x > TREE.pad && x + f.width > TREE.pad + trRowWidth()) {
      x = TREE.pad;
      y += rowH + TREE.gap;
      rowH = 0;
    }
    f.x = x;
    f.y = y;
    x += f.width + TREE.gap;
    rowH = Math.max(rowH, f.height);
  }
  trFit(sec, true);
}

// Xếp dọc các Section cây của `parent` theo thứ tự; node lạ giữ chỗ, Section bị đẩy xuống khi trùng.
function trStack(parent, anchor) {
  const ours = trSorted(parent.children.filter(trIsTree));
  const foreign = parent.children.filter((n) => !trIsTree(n));
  let y = anchor.y;
  for (const s of ours) {
    s.x = anchor.x;
    s.y = y;
    let hit = foreign.find((e) => trOverlap(s, e));
    while (hit) {
      s.y = hit.y + hit.height + TREE.gap;
      hit = foreign.find((e) => trOverlap(s, e));
    }
    y = s.y + s.height + TREE.gap;
  }
}

// Section có Section con thì xếp con (luồng → kệ, cấp khác → chồng dọc) rồi ôm sát; Section lá thì xếp lưới khung màn.
function trLayoutSection(sec) {
  const kids = sec.children.filter(trIsTree);
  if (!kids.length) {
    trReflowFlow(sec);
    return;
  }
  kids.forEach(trLayoutSection);
  if (stTagOf(kids[0], 'treeLevel') === 'flow') {
    trPackFlows(sec);
    return;
  }
  trStack(sec, { x: TREE.pad, y: TREE.head[stTagOf(sec, 'treeLevel')] });
  trFit(sec, true);
}

// Toàn cây dưới root. Root là Section "Hiện tại" (con ở x=pad, y=head) hoặc trang (neo = Section đầu tiên đang có / vị trí vỏ cũ).
function trLayout(root, anchor) {
  root.children.filter(trIsTree).forEach(trLayoutSection);
  trStack(root, root.type === 'SECTION' ? { x: TREE.pad, y: TREE.head.root } : anchor);
  if (root.type === 'SECTION') trFit(root, false);
}

// Neo của Section đầu tiên khi gốc là trang: Section đang có (nhỏ nhất), không thì vỏ cũ (container/Section), không thì (0, 0).
function trAnchor(root) {
  const mine = root.children.filter(trIsTree);
  const pool = mine.length ? mine : root.children.filter((n) => trIsContainer(n) || trIsOldSection(n));
  return pool.length ? { x: Math.min(...pool.map((n) => n.x)), y: Math.min(...pool.map((n) => n.y)) } : { x: 0, y: 0 };
}

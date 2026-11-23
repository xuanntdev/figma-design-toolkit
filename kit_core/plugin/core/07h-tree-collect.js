// Gom khung màn do plugin tạo (ở cây mới lẫn bố cục cũ: container "Hiện tại", vùng Sáng/Tối, Section nhóm cũ), chuyển chúng
// vào đúng Section luồng, rồi dọn vỏ cũ chỉ khi đã trống. Khung chỉ được DI CHUYỂN (cùng nhãn đi kèm), không dựng lại,
// không sửa nội dung; node không tag của designer không bị dời/xoá (vỏ chứa chúng được giữ và báo).

function trIsContainer(n) {
  return n.type === 'FRAME' && stTagOf(n, 'role') === 'container' && stTagOf(n, 'kind') === 'current';
}

// Vỏ do plugin tạo nằm dưới root (đệ quy): Section cây, Section/vùng cũ, container cũ.
function trShells(root, out) {
  for (const c of root.children) {
    if (trIsTree(c) || trIsOldSection(c) || trIsContainer(c)) {
      out.push(c);
      trShells(c, out);
    }
  }
  return out;
}

function trGridFrame(n) {
  return n.type === 'FRAME' && !!stTagOf(n, 'screenId') && ['ai', 'human'].includes(stTagOf(n, 'source'));
}

// Chỉ chủ đề có trong plan được di chuyển; khung chủ đề khác (vd dark sót) ở lại nơi cũ cho khâu dọn xử lý.
function trThemeOk(n) {
  const themes = stPlanThemes();
  return !themes || themes.includes(stTagOf(n, 'theme') || 'light');
}

// Khung bản cũ mất tag nhưng còn tên `screenId · theme` (hoặc `screenId`): nhận lại như bản nháp ai (thay cho stAdoptLegacy từng cha).
function trAdopt(shells, targets) {
  const names = new Map();
  for (const t of targets) {
    names.set(t.screen.id + ' · ' + t.theme, t);
    if (!names.has(t.screen.id)) names.set(t.screen.id, t);
  }
  for (const s of shells) {
    for (const n of s.children) {
      const t = n.type === 'FRAME' && !stTagOf(n, 'screenId') ? names.get(n.name) : null;
      if (t) stTag(n, { screenId: t.screen.id, theme: t.theme, source: 'ai', status: 'draft' });
    }
  }
}

// { shells, items: [{ frame, parent }], cells: Map(theme:screenId → khung) }; adopt = nhận lại khung mất tag (ghi tag).
function trIndex(root, targets) {
  const shells = root ? trShells(root, []) : [];
  trAdopt(shells, targets);
  const items = [];
  const cells = new Map();
  for (const parent of shells) {
    for (const frame of parent.children.filter(trGridFrame)) {
      const key = stKey(stTagOf(frame, 'theme') || 'light', stTagOf(frame, 'screenId'));
      cells.set(key, (cells.get(key) || []).concat(frame));
      if (trThemeOk(frame)) items.push({ frame, parent });
    }
  }
  return { shells, items, cells };
}

function trGroupIdOf(frame, parent) {
  const found = localFindSpec(stTagOf(frame, 'screenId'));
  return (found && found.group.id) || stTagOf(frame, 'groupId') || stTagOf(parent, 'groupId') || '';
}

function trMove(node, to, moves, isFrame) {
  if (node.parent === to) return;
  moves.push({ id: node.id, parentId: node.parent.id, x: node.x, y: node.y, frame: !!isFrame });
  to.appendChild(node);
}

// Đưa mọi khung của plugin (+ nhãn đi kèm) vào Section luồng đúng của nó; tag nhóm của khung theo meta mới nhất.
function trMigrate(root, index) {
  const moves = [];
  for (const { frame, parent } of index.items) {
    const dest = trFlowSection(root, trGroupIdOf(frame, parent), stTagOf(frame, 'screenId'), stTagOf(frame, 'groupId') ? frame : parent);
    if (!dest) continue;
    stTag(frame, stGroupTags({ id: dest.info.id, title: dest.info.title, order: dest.info.order }));
    const labels = stLabelsOf(parent, frame);
    trMove(frame, dest.flow, moves, true);
    labels.forEach((l) => trMove(l, dest.flow, moves));
  }
  return moves;
}

// Vỏ cũ/cây chỉ còn vỏ con, tiêu đề/ô giữ chỗ/nhãn mồ côi do plugin vẽ thì xoá được nguyên khối; mọi node khác (khung màn,
// node designer, Section designer) cản trở và được đếm vào st.kept.
function trDisposable(n, st) {
  if (n.type === 'SECTION' || trIsContainer(n)) {
    if (n.type === 'SECTION' && !trIsTree(n) && !trIsOldSection(n)) {
      st.kept += 1;
      return false;
    }
    return n.children.map((c) => trDisposable(c, st)).every(Boolean);
  }
  if (['label', 'placeholder', 'screenLabel'].includes(stTagOf(n, 'role')) && !trGridFrame(n)) return true;
  st.kept += 1;
  return false;
}

// Xoá vỏ cũ đã trống và Section cây không còn gì; trả { removed: [tên], kept: [{ name, count }] } (kept chỉ cho vỏ cũ ngoài cùng).
function trPrune(root) {
  const res = { removed: [], kept: [] };
  const sweep = (node, nested) => {
    for (const c of (node.children || []).slice()) {
      if (!(trIsTree(c) || trIsOldSection(c) || trIsContainer(c))) continue;
      sweep(c, nested || !trIsTree(c));
      const st = { kept: 0 };
      if (trDisposable(c, st)) {
        if (!trIsTree(c)) res.removed.push(c.name);
        c.remove();
      } else if (st.kept && !nested && !trIsTree(c)) {
        res.kept.push({ name: c.name, count: st.kept });
      }
    }
  };
  sweep(root, false);
  return res;
}

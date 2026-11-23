// layout=sections, target=current: dựng thẳng vào khu "Hiện tại" dạng cây Section (các cấp theo `sectionLevels`, vd khu → nhóm → luồng
// → khung màn), thay cho container lẫn Section Sáng/Tối. Gốc cây = Section "Hiện tại" nếu có, không thì trang "Tính năng" (Section không nằm được trong khung).
// Mỗi lượt: gom mọi khung của plugin (cây mới + bố cục cũ) → chuyển vào đúng Section lá → ghi từng màn trong lô (stApplyCell: thay
// hoặc merge theo `sync`, merge không dựng lại khi nói skip) → dọn vỏ cũ đã trống → xếp lại cả cây. Bố cục xem 07d, meta/tên/màu xem 07g, gom/dọn xem 07h.

function trRootOf(run) {
  if (run.currentSide && run.currentSide.type === 'SECTION') return run.currentSide;
  return run.page || stFindPage(run.opts.pageFeatures) || null;
}

// Một ô (màn + chủ đề) của lô: merge trong Section luồng của màn (khung đã có thì giữ luồng hiện tại khi plan không biết màn).
function trApplyCell(root, t, o) {
  const had = (o.cells.get(stKey(t.theme, t.screen.id)) || [])[0];
  const dest = trFlowSection(root, t.group.id, t.screen.id, null, o.counts, had);
  const info = stCellInfo(t.group, t.screen, t.theme, o.themes);
  return stApplyCell(dest.flow, t, { replace: o.replace, batchId: o.batchId, info, tags: stGroupTags(t.group) });
}

function trNotes(moves, swept) {
  const notes = [];
  const frames = moves.filter((m) => m.frame).length;
  if (frames) notes.push('Đã chuyển ' + frames + ' khung vào cây Section ' + stTreeLevels().join(' → ') + '.');
  if (swept.removed.length) notes.push('Đã xoá ' + swept.removed.length + ' vỏ bố cục cũ đã trống.');
  for (const k of swept.kept) notes.push('Giữ lại "' + k.name + '" (bố cục cũ) vì có ' + k.count + ' node không phải của plugin, chưa dọn được.');
  return notes;
}

async function localRunTree(run, targets, plan, batchId) {
  const root = trRootOf(run) || await stEnsurePage(run.opts.pageFeatures);
  const page = root.type === 'PAGE' ? root : run.page;
  if (figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page);
  await stPrepare();
  await stEnsureFonts();
  const index = trIndex(root, targets);
  const o = { replace: plan.replace !== false, batchId, themes: stProjectThemes(plan), counts: index.counts, cells: index.cells };
  const anchor = trAnchor(root);
  const moves = trMigrate(root, index);
  const proposals = targets.map((t, i) => {
    figma.ui.postMessage({ type: 'PLUGIN_PROGRESS', pct: Math.round(((i + 1) / targets.length) * 92), text: 'Đang cập nhật ' + t.screen.title + '…' });
    return trApplyCell(root, t, o);
  });
  const swept = trPrune(root);
  trLayout(root, anchor);
  if (stExtension().finish) await stExtension().finish();
  stampFile();
  figma.commitUndo();
  return { proposals, moves, swept, rootId: root.id, notes: trNotes(moves, swept) };
}

// Hoàn tác bản không có triggerUndo: đưa khung đã chuyển về cha cũ nếu cha còn (triggerUndo thì gỡ trọn cả lượt, gồm di chuyển).
async function trRestoreMoves(batch) {
  for (const m of batch.moves || []) {
    const node = await figma.getNodeByIdAsync(m.id);
    const parent = await figma.getNodeByIdAsync(m.parentId);
    if (!node || node.removed || !parent || parent.removed) continue;
    parent.appendChild(node);
    node.x = m.x;
    node.y = m.y;
  }
  const root = batch.rootId ? await figma.getNodeByIdAsync(batch.rootId) : null;
  if (root && !root.removed) {
    const sweep = trPrune(root);
    return sweep.removed.length;
  }
  return 0;
}

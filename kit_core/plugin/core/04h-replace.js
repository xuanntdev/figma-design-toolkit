// Chế độ đồng bộ `sync: "replace"` (mặc định, như kit gốc): mỗi lượt Cập nhật thay bản nháp `source=ai` của ô (màn + chủ đề) bằng bản
// dựng mới; chỉ bản đã chọn (status=chosen) hoặc vẽ tay (source=human) được giữ, bản mới đặt cạnh. Không so vân tay, không xung đột.
// `sync: "merge"` dùng mgApply (04f). stApplyCell là điểm vào chung của mọi nơi ghi khung của một ô.

function rpApply(parent, t, o) {
  const id = t.screen.id;
  stAdoptLegacy(parent, id, t.theme);
  const same = parent.children.filter((n) => n.type === 'FRAME' && stSameCell(n, id, t.theme) && stTagOf(n, 'source'));
  const kept = same.filter(stIsProtected);
  const drafts = same.filter((n) => !kept.includes(n) && stTagOf(n, 'source') === 'ai');
  const out = {
    groupId: t.group.id, groupTitle: t.group.title, screenId: id, theme: t.theme, text: stScreenText(t.group, t.screen),
    action: drafts.length ? 'replace' : 'create', keptProtected: kept.length,
  };
  if (o.replace === false && same.length) {
    drafts.forEach((n) => o.info && stSetScreenLabel(parent, n, o.info));
    return Object.assign(out, { frameId: same[0].id, reused: true, action: 'skip' });
  }
  drafts.forEach((n) => {
    stDropLabels(parent, n);
    n.remove();
  });
  stSweepLabels(parent, id, t.theme);
  const frame = stBuildFrame(t.screen.raw, t.theme);
  parent.appendChild(frame);
  stTag(frame, Object.assign({ screenId: id, theme: t.theme, source: 'ai', status: 'draft', variant: kept.length, batchId: o.batchId }, o.tags || {}));
  if (o.info) stSetScreenLabel(parent, frame, o.info);
  return Object.assign(out, { frameId: frame.id, reused: false, replaced: drafts.length });
}

// Ghi (hoặc giữ) khung một ô trong `parent` theo `sync`. o: { replace, batchId, info (tên/nhãn màn, null = không đặt), tags }.
function stApplyCell(parent, t, o) {
  return stSyncMerge() ? mgApply(parent, t, o) : rpApply(parent, t, o);
}

// Tên layer + nhãn của màn theo `screenLabels`: false thì không đặt gì (null).
function stCellInfo(group, screen, theme, themes) {
  return stLabelMode() ? stScreenInfo(group, screen, theme, themes) : null;
}

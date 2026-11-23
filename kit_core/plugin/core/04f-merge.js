// Đồng bộ kiểu git theo MÀN: mỗi lượt Cập nhật = pull Figma -> merge 3 chiều -> push.
//   base   = bản plugin dựng lần trước, lưu ngay trên khung: plugin data `fp` (vân tay nội dung) + `srcHash` (hash nội dung
//            nguồn đã dùng để dựng, vd snapshot) + `buildHash` (hash mã bộ dựng, để đổi bộ dựng thì dựng lại khung chưa sửa);
//   theirs = khung hiện tại trên Figma (vân tay hiện tại so với `fp`);
//   ours   = nguồn mới trong bundle (`srcHash` mới so với `srcHash` của base).
//   theirs  ours
//   giống   giống  -> skip      (không dựng lại)         giống  khác -> replace (thay bằng bản mới)
//   khác    giống  -> keepEdit  (giữ bản sửa tay)         khác   khác -> conflict (giữ bản sửa tay + bản mới cạnh, đánh dấu)
// Khung bản cũ chưa có srcHash: base không rõ, giữ logic an toàn: nguyên bản thì thay, đã sửa/vẽ tay thì giữ + dựng bản mới cạnh.
// Hàm mg* phân loại là thuần đọc (dùng được cho "Xem trước"); mgApply mới ghi.

const MG_SRC = new WeakMap();
const MG_BUCKET = { new: 'create', replace: 'replace', skip: 'skip', keepEdit: 'keepEdit', beside: 'keepEdit', conflict: 'conflict' };

function stHash64(s) {
  return fpMix(2166136261, s).toString(16) + fpMix(5381, s).toString(16);
}

// Chuỗi nguồn của một màn: extension có `sourceKey(screen)` thì dùng, không thì chính đối tượng màn.
function stSourceKey(screen) {
  const ext = stExtension();
  return ext.sourceKey ? ext.sourceKey(screen) : JSON.stringify(screen);
}

function stSourceNow(screen) {
  let v = typeof screen === 'object' && screen ? MG_SRC.get(screen) : null;
  if (!v) {
    v = { src: stHash64(stSourceKey(screen) || ''), build: typeof BUILDER_HASH === 'undefined' ? '' : BUILDER_HASH };
    if (typeof screen === 'object' && screen) MG_SRC.set(screen, v);
  }
  return v;
}

function stStampSource(frame, screen) {
  const v = stSourceNow(screen);
  stTag(frame, { srcHash: v.src, buildHash: v.build });
}

function mgIsEdited(f) {
  const source = stTagOf(f, 'source');
  return source === 'human' ? stTagOf(f, 'edited') === '1' : source === 'ai' && stEditedNow(f);
}

function mgIsProtected(f) {
  return stTagOf(f, 'status') === 'chosen' || stTagOf(f, 'source') === 'human' || mgIsEdited(f);
}

// Phân loại một ô (màn + chủ đề) từ các khung hiện có. Trả { action, base?, drafts, prot, now, reuse? }.
function mgPlan(frames, screen) {
  const now = stSourceNow(screen);
  const ours = frames.filter((f) => stTagOf(f, 'source'));
  const prot = ours.filter(mgIsProtected);
  const drafts = ours.filter((f) => !prot.includes(f));
  const base = ours.find((f) => mgIsEdited(f) && stTagOf(f, 'srcHash') && stTagOf(f, 'status') !== 'chosen');
  const fresh = (d) => stTagOf(d, 'srcHash') === now.src && stTagOf(d, 'buildHash') === now.build;
  const res = { drafts, prot, now, base };
  if (base) {
    if (stTagOf(base, 'srcHash') === now.src) return Object.assign(res, { action: 'keepEdit' });
    const pending = drafts.length === 1 && stTagOf(drafts[0], 'conflictOf') === base.id && fresh(drafts[0]);
    return Object.assign(res, { action: 'conflict', reuse: pending });
  }
  if (!ours.length) return Object.assign(res, { action: 'new' });
  if (!drafts.length) return Object.assign(res, { action: 'beside' });
  return Object.assign(res, { action: drafts.length === 1 && fresh(drafts[0]) ? 'skip' : 'replace' });
}

function mgLabelFresh(parent, frame, info) {
  const ls = stLabelsOf(parent, frame);
  const text = (part) => (ls.find((n) => stTagOf(n, 'part') === part) || {}).characters;
  return frame.name === info.name && (!ST_GRID.labelH || (text('title') === info.text && text('stem') === info.stem));
}

function mgBuild(parent, t, o, plan, out) {
  const id = t.screen.id;
  const replacedIds = plan.drafts.map((n) => n.id);
  plan.drafts.forEach((n) => {
    stDropLabels(parent, n);
    n.remove();
  });
  stSweepLabels(parent, id, t.theme);
  const frame = stBuildFrame(t.screen.raw, t.theme);
  parent.appendChild(frame);
  stTag(frame, Object.assign({ screenId: id, theme: t.theme, source: 'ai', status: 'draft', variant: plan.prot.length, batchId: o.batchId }, o.tags || {}));
  if (o.info) stSetScreenLabel(parent, frame, o.info);
  if (plan.action === 'conflict') stMarkConflict(parent, plan.base, frame);
  return Object.assign(out, { frameId: frame.id, reused: false, replaced: plan.drafts.length, replacedIds });
}

// Không dựng lại: giữ khung (bản nháp nguyên bản, bản sửa tay, hoặc cặp xung đột đã có), dọn dấu xung đột đã hết hiệu lực.
function mgKeep(parent, plan, o, out) {
  const keep = plan.action === 'conflict' ? plan.drafts[0] : (plan.base || plan.drafts[0]);
  if (plan.action === 'skip' && o.info && !mgLabelFresh(parent, keep, o.info)) stSetScreenLabel(parent, keep, o.info);
  if (plan.reuse) stMarkConflict(parent, plan.base, keep);
  const pending = plan.drafts.some((d) => d !== keep && stTagOf(d, 'conflictOf') === keep.id);
  if (plan.action !== 'conflict' && stTagOf(keep, 'conflict') === '1' && !pending) stClearConflict(parent, keep);
  return Object.assign(out, { frameId: keep.id, reused: true });
}

// Đặt (hoặc giữ) khung một ô trong `parent` theo bảng merge. o: { replace, batchId, info (nhãn màn), tags (thêm cho khung mới) }.
function mgApply(parent, t, o) {
  const id = t.screen.id;
  stAdoptLegacy(parent, id, t.theme);
  const same = parent.children.filter((n) => n.type === 'FRAME' && stSameCell(n, id, t.theme));
  same.forEach((n) => { if (stTagOf(n, 'source') === 'ai') stIsEdited(n); });
  const plan = mgPlan(same, t.screen.raw);
  const out = {
    groupId: t.group.id, groupTitle: t.group.title, screenId: id, theme: t.theme, text: stScreenText(t.group, t.screen),
    action: plan.action, keptProtected: plan.prot.length,
  };
  if (o.replace === false && same.length) {
    plan.drafts.forEach((n) => o.info && stSetScreenLabel(parent, n, o.info));
    return Object.assign(out, { frameId: same[0].id, reused: true, action: 'skip' });
  }
  if (plan.action === 'skip' || plan.action === 'keepEdit' || plan.reuse) return mgKeep(parent, plan, o, out);
  return mgBuild(parent, t, o, plan, out);
}

// Gom kết quả theo nhóm bảng merge: { counts, items } (items: skip/create/replace/keepEdit/conflict).
function mgSummarize(rows) {
  const items = { skip: [], create: [], replace: [], keepEdit: [], conflict: [] };
  for (const r of rows) {
    items[MG_BUCKET[r.action] || (r.reused ? 'skip' : 'replace')].push({ screenId: r.screenId, theme: r.theme, groupId: r.groupId, text: r.text || r.screenId, draft: r.action === 'beside' });
  }
  const counts = {};
  Object.keys(items).forEach((k) => { counts[k] = items[k].length; });
  return { counts, items };
}

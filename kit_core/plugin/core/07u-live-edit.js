let LIVE_STAGED = null;
const LIVE_EDIT_MAX = 500;
// Lượt stage (xem trước rồi bấm Cập nhật) cho phép nhiều layer hơn: gắn token / gộp component cả trang.
const LIVE_STAGE_MAX = 10000;

function liveCheckExpected(edit, steps) {
  if (edit.expect == null) return;
  if (!liveRecord(edit.expect)) throw new Error('expect phải là một đối tượng.');
  for (const [key, value] of Object.entries(edit.expect)) {
    const step = steps.find((row) => row.key === key);
    if (!step || !liveEqual(step.before, value)) throw new Error('Giá trị đã đổi trên layer ' + edit.nodeId + ': ' + key);
  }
}

async function liveEditRow(edit, protectedPages) {
  if (!liveRecord(edit)) throw new Error('Mỗi mục sửa cần một nodeId và set.');
  if (edit.variableId) return liveVariableRow(edit);
  const node = await liveNode(edit.nodeId);
  if (!livePage(node) || node.type === 'PAGE') throw new Error('Đích sửa phải là layer trên canvas.');
  const scope = liveScope(node);
  const blocked = protectedPages.has(scope.pageId);
  if (edit.replace && edit.set) throw new Error('Mục sửa chỉ dùng một trong replace hoặc set: ' + edit.nodeId);
  const steps = blocked ? [] : edit.replace ? [await liveReplaceStep(node, edit.replace)] : await liveSteps(node, edit.set);
  if (!blocked) liveCheckExpected(edit, steps);
  return { node, scope, blocked, steps };
}

function livePreviewStep({ key, before, after }) {
  const display = (value) => {
    const text = JSON.stringify(value) ?? '∅';
    return text.length > 80 ? text.slice(0, 77) + '…' : text;
  };
  return key + ' ' + display(before) + ' → ' + display(after);
}

function liveComponentPreview(screens, instances) {
  const overridden = new Map();
  for (const { scope, instance, effects } of instances) {
    const item = screens.get(scope.frameId) || overridden.get(scope.frameId) || { ...scope, details: [] };
    for (const effect of effects) {
      const target = instance + ' / ' + effect.layer;
      if (effect.inherited.length) item.details.push(target + ' · Kế thừa: ' + effect.inherited.join(', '));
      if (effect.overridden.length) item.details.push(target + ' · Giữ override: ' + effect.overridden.join(', '));
      if (effect.uncertain.length) item.details.push(target + ' · Cần kiểm tra: ' + effect.uncertain.join(', '));
      if (effect.inherited.length || effect.uncertain.length) item.inherited = true;
    }
    if (item.inherited || screens.has(scope.frameId)) {
      screens.set(scope.frameId, item);
      overridden.delete(scope.frameId);
    } else overridden.set(scope.frameId, item);
  }
  return [...overridden.values()];
}

function liveSummarizeEdits(rows, instances, inherited) {
  const screens = new Map();
  for (const row of rows) {
    const scope = row.scope;
    const item = screens.get(scope.frameId) || { ...scope, details: [], blocked: row.blocked };
    const changes = row.steps.filter((step) => !liveEqual(step.before, step.after));
    if (row.blocked || changes.length) {
      item.details.push((row.node?.name || row.name) + (row.blocked ? ' · cấm ghi' : ' · ' + changes.map(livePreviewStep).join(', ')));
      screens.set(scope.frameId, item);
    }
  }
  for (const scope of inherited) {
    if (!screens.has(scope.frameId)) screens.set(scope.frameId, { ...scope, details: ['Thay đổi kế thừa'], inherited: true });
  }
  const overridden = liveComponentPreview(screens, instances);
  const changes = [...screens.values()].filter((row) => !row.blocked);
  const blocked = [...screens.values()].filter((row) => row.blocked);
  return { changes, blocked, overridden };
}

async function livePlanEdits(args, max) {
  const edits = args.edits;
  const limit = max || LIVE_EDIT_MAX;
  const keyOf = (edit) => edit?.nodeId || (edit?.variableId && edit.variableId + '/' + edit.modeId);
  if (!Array.isArray(edits) || !edits.length || edits.length > limit || new Set(edits.map(keyOf)).size !== edits.length) {
    throw new Error('Cần 1–' + limit + ' layer đích khác nhau.');
  }
  const protectedPages = liveProtected();
  const rows = [];
  for (const edit of edits) rows.push(await liveEditRow(edit, protectedPages));
  const writeRows = rows.filter((row) => row.steps.some((step) => !liveEqual(step.before, step.after)));
  const instances = await liveComponentImpact(writeRows.map(({ node, steps }) => ({
    node, fields: [...new Set(steps.flatMap(liveChangedFields))].sort(),
  })));
  const inherited = await liveVariableImpact(writeRows.map((row) => row.variableId).filter(Boolean));
  inherited.sort((a, b) => a.frameId.localeCompare(b.frameId));
  const preview = liveSummarizeEdits(rows, instances, inherited);
  const identity = rows.map((row) => ({
    scope: row.scope, id: row.node?.id || row.variableId, blocked: row.blocked,
    before: row.steps.map(({ key, before, context }) => ({ key, before, context })),
  }));
  const fingerprint = JSON.stringify(liveStable({ identity, instances, inherited }));
  return { writeRows, preview, fingerprint };
}

function liveRememberEdits(rows, rollback) {
  for (const frame of new Set(rows.flatMap(({ node }) => (node && !node.removed ? [liveScreen(node)] : [])))) {
    if (stTagOf(frame, 'source') !== 'ai') continue;
    const edited = stTagOf(frame, 'edited');
    rollback.push(() => stTag(frame, { source: 'ai', edited }));
    stTag(frame, { source: 'human', edited: '1' });
  }
}

async function liveRollback(rollback, error) {
  const failures = [];
  for (const restore of rollback.reverse()) {
    try { await restore(); } catch (err) { failures.push(err.message); }
  }
  if (failures.length) {
    figma.commitUndo();
    throw new Error(error.message + '. Khôi phục chưa hết. Dùng Undo trong Figma.');
  }
  throw error;
}

function liveCommit() {
  LOCAL_LAST_BATCH = null;
  figma.commitUndo();
}

async function liveWriteEdits(plan) {
  assertCanWrite();
  const rollback = [];
  for (const row of plan.writeRows) liveAssertPage(row.node);
  try {
    for (const row of plan.writeRows) {
      liveAssertPage(row.node);
      for (const step of row.steps) {
        if (liveEqual(step.before, step.after)) continue;
        rollback.push(() => (step.restore || step.apply)(step.before));
        await step.apply(step.after);
      }
    }
    liveRememberEdits(plan.writeRows, rollback);
  } catch (error) {
    await liveRollback(rollback, error);
  }
  if (rollback.length) liveCommit();
  return { changed: plan.writeRows.length, ...plan.preview };
}

async function liveEdit(args) {
  const plan = await livePlanEdits(args);
  if (plan.preview.blocked.length) throw new Error('Page bị cấm ghi: ' + plan.preview.blocked.map((row) => row.page).join(', '));
  const scopes = plan.preview.changes;
  const hasLibrary = plan.writeRows.some((row) => row.variableId || liveComponent(row.node));
  const count = hasLibrary ? scopes.filter((scope) => scope.isScreen).length : scopes.length;
  if (count > 1) throw new Error('Yêu cầu sửa nhiều màn. Chuẩn bị danh sách bằng stage rồi bấm Cập nhật.');
  return liveWriteEdits(plan);
}

async function liveStage(args) {
  const plan = await livePlanEdits(args, LIVE_STAGE_MAX);
  LIVE_STAGED = plan.preview.changes.length ? { jobId: args.jobId, edits: args.edits, fingerprint: plan.fingerprint } : null;
  return plan.preview;
}

async function liveApply(args) {
  const staged = LIVE_STAGED;
  if (!staged || staged.jobId !== args.jobId) throw new Error('Lượt cập nhật đã đổi. Chuẩn bị lại danh sách.');
  LIVE_STAGED = null;
  const plan = await livePlanEdits(staged, LIVE_STAGE_MAX);
  if (plan.fingerprint !== staged.fingerprint) throw new Error('Đích, dữ liệu hoặc quyền ghi đã đổi. Chuẩn bị lại danh sách.');
  return liveWriteEdits(plan);
}

Object.assign(PLUGIN_COMMANDS, { liveEdit, liveStage, liveApply });

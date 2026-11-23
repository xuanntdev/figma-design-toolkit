// Builds proposals into the "proposed" container SCOPED to one cell: only an `ai`, not-yet-chosen node of the
// same screenId + theme is replaced. A node with `status=chosen` or `source=human` is never deleted; a new
// proposal is built beside it instead. How a screen is drawn comes from the extension (build).

let ST_PREPARED = false;

// The extension may need fonts or tokens ready before it draws; done once per plugin session.
async function stPrepare() {
  if (ST_PREPARED) return;
  const ext = stExtension();
  if (ext.prepare) await ext.prepare();
  ST_PREPARED = true;
}

function stFindScreen(id) {
  for (const g of stGroups()) {
    const s = g.screens.find((x) => x.stem === id);
    if (s) return s;
  }
  return null;
}

function stSameCell(node, id, theme) {
  return stTagOf(node, 'screenId') === id && (stTagOf(node, 'theme') || 'light') === theme;
}

function stIsProtected(node) {
  // Giữ bản đã chọn / vẽ tay; chế độ sync=merge còn giữ cả khung `ai` mà designer đã sửa tay (so vân tay).
  return stTagOf(node, 'status') === 'chosen' || stTagOf(node, 'source') === 'human' || (stSyncMerge() && stIsEdited(node));
}

// Removes the unprotected ai nodes of this cell; returns how many were replaced and how many were kept.
function stReplaceAi(container, id, theme) {
  let replaced = 0;
  let kept = 0;
  stAdoptLegacy(container, id, theme);
  for (const n of container.children.slice()) {
    // A label dropped together with its frame earlier in this loop is still in the snapshot list.
    if (n.removed || !stSameCell(n, id, theme) || !stTagOf(n, 'source')) continue;
    if (stIsProtected(n)) {
      kept += 1;
    } else if (stTagOf(n, 'source') === 'ai') {
      stDropLabels(container, n);
      n.remove();
      replaced += 1;
    }
  }
  stSweepLabels(container, id, theme);
  return { replaced, kept };
}

// args: { screenIds: [..] (default: all), themes: ['light'] }.
async function cmdBuildImproved(args) {
  assertCanWrite(args);
  if (!stImprovedOn()) throw new Error('Dự án đã tắt khu Cải tiến (improved=false).');
  await cmdEnsureLayout(args);
  const container = await stRequireContainer(args, 'improved');
  await stPrepare();
  const ext = stExtension();
  const ids = (args.screenIds && args.screenIds.length) ? args.screenIds : stGroups().flatMap((g) => g.screens.map((s) => s.stem));
  const out = { built: [], replaced: 0, keptProtected: 0, unknown: [] };
  for (const id of ids) {
    const screen = stFindScreen(id);
    if (!screen) { out.unknown.push(id); continue; }
    for (const theme of args.themes || ['light']) {
      const r = stReplaceAi(container, id, theme);
      out.replaced += r.replaced;
      out.keptProtected += r.kept;
      const frame = stBuildFrame(screen, theme);
      container.appendChild(frame);
      stTag(frame, { source: 'ai', status: 'draft', screenId: id, theme, variant: r.kept });
      out.built.push(id + ':' + theme);
    }
  }
  if (ext.finish) await ext.finish();
  stampFile();
  out.layout = await cmdEnsureLayout(args);
  return out;
}

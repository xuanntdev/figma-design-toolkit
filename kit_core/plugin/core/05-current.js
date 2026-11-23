// Sync of the CURRENT UI into the "current" container. The plugin cannot read the disk, so ui.html fetches the
// manifest and images from the bridge and calls these two commands: `currentPlan` (which images changed) and
// `currentApply` (place them). A cell is identified by screenId + theme. An image whose hash changed is replaced;
// an unchanged one leaves the node alone; a screen missing from the manifest is only marked `removed`.

async function stRequireContainer(args, kind) {
  const o = stOpts(args);
  await figma.loadAllPagesAsync();
  const page = stFindPage(o.pageFeatures);
  const c = page && stFindContainer(page, kind);
  if (!c) throw new Error('Chưa có khung ' + (kind === 'current' ? o.currentName : o.improvedName) + '. Hãy chạy ensureLayout trước.');
  return c;
}

function stCurrentCells(container) {
  const map = {};
  for (const n of container.children) {
    if (stTagOf(n, 'role') === 'cell') map[stKey(stTagOf(n, 'theme'), stTagOf(n, 'screenId'))] = n;
  }
  return map;
}

// entries: [{ screenId, theme, hash }] => { changed, unchanged, removed }.
async function cmdCurrentPlan(args) {
  const cells = stCurrentCells(await stRequireContainer(args, 'current'));
  const wanted = {};
  const changed = [];
  let unchanged = 0;
  for (const e of args.entries || []) {
    const key = stKey(e.theme, e.screenId);
    wanted[key] = true;
    const cell = cells[key];
    if (cell && stTagOf(cell, 'hash') === e.hash && stTagOf(cell, 'status') !== 'removed') unchanged += 1;
    else changed.push({ screenId: e.screenId, theme: e.theme });
  }
  const removed = Object.keys(cells).filter((k) => !wanted[k] && stTagOf(cells[k], 'status') !== 'removed')
    .map((k) => ({ screenId: stTagOf(cells[k], 'screenId'), theme: stTagOf(cells[k], 'theme') }));
  return { changed, unchanged, removed };
}

function stWriteCell(container, cells, item, app) {
  const key = stKey(item.theme, item.screenId);
  const image = figma.createImage(figma.base64Decode(item.base64));
  let cell = cells[key];
  if (!cell) {
    cell = figma.createFrame();
    container.appendChild(cell);
    cells[key] = cell;
  }
  cell.resize(ST_GRID.cellW, ST_GRID.cellH);
  cell.name = item.screenId + ' · ' + item.theme;
  cell.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
  cell.opacity = 1;
  stTag(cell, {
    role: 'cell', source: 'current', status: 'current', screenId: item.screenId, theme: item.theme, hash: item.hash,
    capturedAt: (app && app.capturedAt) || '', appVersion: (app && app.version) || '', commit: (app && app.commit) || '',
  });
  cell.locked = true;
}

// items: [{ screenId, theme, hash, base64 }]; removed: [{ screenId, theme }]; app: { version, commit, capturedAt }.
async function cmdCurrentApply(args) {
  assertCanWrite();
  const container = await stRequireContainer(args, 'current');
  const cells = stCurrentCells(container);
  for (const item of args.items || []) stWriteCell(container, cells, item, args.app);
  for (const r of args.removed || []) {
    const cell = cells[stKey(r.theme, r.screenId)];
    if (!cell) continue;
    stTag(cell, { status: 'removed' });
    cell.opacity = 0.35;
  }
  stampFile();
  const layout = await cmdEnsureLayout(args);
  return { applied: (args.items || []).length, markedRemoved: (args.removed || []).length, layout };
}

// Chiều ngược Figma -> repo (3/3): lệnh `readState` duyệt cả file và trả { kind, version, files } — index.json (trang, Section, từng khung màn
// kèm trạng thái untouched | edited | handmade | unknown), screens/<khoá>.json (cây node), tokens.json, components.json. THUẦN ĐỌC: không ghi
// node/plugin data, không đổi trang, không commitUndo. Nơi nhận: cầu nối localhost (design_sync.py pull).

const RS_KIND = 'figma-state';
const RS_VERSION = 1;
const RS_MAX_NODES = 800;
const RS_MAX_DEPTH = 16;
const RS_LEGEND = 'screens/*.json: t loại, n tên, x y w h, fills/strokes [{c, a, var}], r bo góc, vars {trường: biến}, lm H|V, gap, pad, chars/font/size/style, '
  + 'INSTANCE: main set variant props texts nested overridden. status: untouched = giống bản plugin dựng; edited = designer đã sửa; handmade = khung không do plugin tạo; unknown = khung cũ chưa có dấu vân tay.';

function rsSlug(text) {
  return String(text).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '').slice(0, 120) || 'x';
}

// Trạng thái một khung theo đúng dấu vân tay của plugin (fp lúc dựng so với vân tay hiện tại). Không gọi stIsEdited (hàm đó có thể dựng/xoá node).
function rsStatus(f) {
  const source = stTagOf(f, 'source');
  const fp = stTagOf(f, 'fp');
  const fpNow = stFingerprint(f);
  let status = 'untouched';
  if (!source || (source === 'human' && stTagOf(f, 'edited') !== '1')) status = 'handmade';
  else if (stTagOf(f, 'edited') === '1' || (fp && fp !== fpNow)) status = 'edited';
  else if (!fp) status = 'unknown';
  return { status, source, fp, fpNow };
}

// Duyệt một trang: khung màn của plugin (có tag screenId), khung vẽ tay, Section (đường dẫn + cấp). Khung chỉ chứa (container/cell) thì đi tiếp vào trong.
function rsWalk(node, path, acc) {
  for (const c of node.children || []) {
    if (c.removed) continue;
    if (c.type === 'SECTION') {
      const here = path.concat(c.name);
      acc.sections.push({ id: c.id, path: here.join(' / '), name: c.name, level: stTagOf(c, 'treeLevel') || String(here.length), screens: 0 });
      rsWalk(c, here, acc);
    } else if (c.type === 'GROUP') {
      rsWalk(c, path.concat(c.name), acc);
    } else if (c.type === 'FRAME') {
      const role = stTagOf(c, 'role');
      // Khung có screenId luôn là một màn (target=current thì chính khung màn mang role 'cell'); container/cell không mã màn chỉ là khung chứa.
      if (stTagOf(c, 'screenId') || !role) {
        acc.frames.push({ frame: c, path });
        rsWalkCreated(c, path.concat(c.name), acc);
      }
      else if (role === 'container' || role === 'cell') rsWalk(c, path, acc);
    }
  }
}

function rsWalkCreated(node, path, acc) {
  for (const c of node.children || []) {
    if (c.removed || !['FRAME', 'GROUP', 'SECTION'].includes(c.type)) continue;
    if (stTagOf(c, LIVE_SCREEN_KEY)) acc.frames.push({ frame: c, path });
    rsWalkCreated(c, path.concat(c.name), acc);
  }
}

function rsSpec(id) {
  try { return localFindSpec(id); } catch (err) { return null; }
}

// Màn có trong nguồn repo: tiêu đề/mã/nhóm, nguồn đã đổi chưa (repoChanged) và chữ thêm/bớt so với nguồn.
function rsRepoInfo(f, row) {
  const found = row.screenId ? rsSpec(row.screenId) : null;
  if (!found) return;
  row.title = found.screen.title;
  row.code = stScreenCode(found.group, found.screen);
  row.groupId = row.groupId || found.group.id;
  try {
    if (row.srcHash) row.repoChanged = stSourceNow(found.screen.raw).src !== row.srcHash;
    const diff = row.status === 'edited' || row.status === 'unknown' ? pvTextDiff(f, found.screen.raw) : null;
    if (diff && (diff.added.length || diff.removed.length)) row.textDiff = diff;
  } catch (err) { /* nguồn không có dữ liệu so sánh */ }
}

function rsRow(f, path, page, st) {
  const screenId = stTagOf(f, 'screenId');
  const row = Object.assign({ screenId: screenId || null, name: f.name, id: f.id, pageId: page.id, page: page.name, section: path.join(' / ') }, rsGeom(f), st);
  row.theme = stTagOf(f, 'theme') || (screenId ? 'light' : '');
  row.groupId = stTagOf(f, 'groupId');
  row.srcHash = stTagOf(f, 'srcHash');
  row.buildHash = stTagOf(f, 'buildHash');
  if (stTagOf(f, 'status') === 'chosen') row.chosen = true;
  if (stTagOf(f, 'conflict') === '1') row.conflict = true;
  rsRepoInfo(f, row);
  return row;
}

// Khoá/tên tệp của một màn: mã màn (+ chủ đề tối), khung vẽ tay là frame-<id>; trùng thì thêm id node.
function rsKey(row, used) {
  let key = row.screenId ? rsSlug(row.screenId) + (row.theme && row.theme !== 'light' ? '--' + rsSlug(row.theme) : '') : 'frame-' + rsSlug(row.id);
  if (used.has(key)) key += '-' + rsSlug(row.id);
  used.add(key);
  return key;
}

async function rsScreens(ctx, maxNodes) {
  const pages = [];
  const rows = [];
  const files = {};
  const used = new Set();
  for (const page of figma.root.children) {
    const acc = { sections: [], frames: [] };
    rsWalk(page, [], acc);
    for (const { frame, path } of acc.frames) {
      const row = rsRow(frame, path, page, rsStatus(frame));
      row.key = rsKey(row, used);
      row.file = 'screens/' + row.key + '.json';
      ctx.budget.left = maxNodes;
      files[row.file] = { key: row.key, screenId: row.screenId, id: row.id, name: row.name, status: row.status, tree: await rsNode(frame, ctx, RS_MAX_DEPTH) };
      rows.push(row);
      const sec = acc.sections.find((s) => s.path === row.section);
      if (sec) sec.screens += 1;
    }
    pages.push({
      id: page.id, name: page.name, blocked: liveProtected().has(page.id),
      role: page.name === rsTokenPageName() ? 'tokens' : 'screens', sections: acc.sections, frames: acc.frames.length,
    });
  }
  return { pages, rows, files };
}

function rsCounts(rows) {
  const n = (f) => rows.filter(f).length;
  return {
    screens: n((r) => r.status !== 'handmade'), untouched: n((r) => r.status === 'untouched'), edited: n((r) => r.status === 'edited'),
    unknown: n((r) => r.status === 'unknown'), handmade: n((r) => r.status === 'handmade'), conflicts: n((r) => r.conflict),
  };
}

// args: { requestId?, maxNodes? }. Trả payload gửi qua cầu nối hoặc tải thành tệp.
async function cmdReadState(args) {
  await figma.loadAllPagesAsync();
  const ctx = await rsContext(RS_MAX_NODES);
  const screens = await rsScreens(ctx, (args && args.maxNodes) || RS_MAX_NODES);
  const tokens = await rsTokens(ctx);
  const components = await rsComponents(ctx);
  const index = {
    kind: RS_KIND, version: RS_VERSION, plugin: PLUGIN_VERSION, builder: typeof BUILDER_HASH === 'undefined' ? '' : BUILDER_HASH,
    file: figma.root.name, readAt: new Date().toISOString(), legend: RS_LEGEND, counts: rsCounts(screens.rows), pages: screens.pages, screens: screens.rows,
    tokens: { collections: tokens.collections.length, variables: tokens.collections.reduce((s, c) => s + c.variables.length, 0), textStyles: tokens.textStyles.length },
    components: { sets: components.sets.length, components: components.components.length },
  };
  const files = Object.assign({ 'index.json': index, 'tokens.json': tokens, 'components.json': components }, screens.files);
  return { kind: RS_KIND, version: RS_VERSION, requestId: (args && args.requestId) || null, readAt: index.readAt, files };
}

PLUGIN_COMMANDS.readState = cmdReadState;

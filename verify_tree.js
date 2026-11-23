// Kiểm cây Section khu → nhóm → luồng → khung màn của khu Hiện tại (Figma giả nghiêm ngặt): cấu trúc 4 cấp đúng tên/thứ tự/màu,
// nhóm xen kẽ khu, di chuyển từ bố cục cũ (container, Section nhóm cũ) không mất/nhân đôi khung và giữ nội dung sửa tay,
// vỏ cũ trống bị xoá / có node designer thì giữ + báo, Section ôm nội dung không đè, chạy lặp ổn định, merge skip sau khi di chuyển,
// Hoàn tác gỡ cả di chuyển, sắp xếp lại mỗi lượt kể cả nhóm ngoài lô.
// Chạy: node verify_tree.js <tree1/code.js> <tree2/code.js>  (verify_release.py dựng 2 bundle với plan có area + screenFlows khác nhau).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { strictNode, markRemoved } = require('./tests/strict-node.js');
const U = require('./tests/tree-util.js');

let seq = 1;
const BY_ID = new Map();
const COUNT = { mut: 0 };
class MockNode {
  constructor(type) {
    Object.assign(this, { id: 'N' + seq++, type, name: type, children: [], parent: null, x: 0, y: 0, width: 100, height: type === 'TEXT' ? 24 : 100, fills: [], strokes: [], _pd: {} });
    const proxy = strictNode(this);
    BY_ID.set(this.id, proxy);
    return proxy;
  }
  getPluginData(k) { return this._pd[k] || ''; }
  setPluginData(k, v) { this._pd[k] = String(v); }
  resize(w, h) { this.width = w; this.height = h; COUNT.mut += 1; }
  appendChild(ch) {
    if (ch.parent) ch.parent.children = ch.parent.children.filter((x) => x !== ch);
    ch.parent = this;
    this.children.push(ch);
    COUNT.mut += 1;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
    this.parent = null;
    markRemoved(this);
    COUNT.mut += 1;
  }
}

// getNodeByIdAsync như Figma thật: node đã xoá → null.
function open(bundle, root, opts) {
  const msgs = [];
  const log = { commits: [], undo: 0 };
  const figma = {
    root, currentPage: root.children[0], ui: { onmessage: null, postMessage: (m) => msgs.push(m) }, showUI() {}, closePlugin() {},
    loadAllPagesAsync: async () => {}, setCurrentPageAsync: async (p) => { figma.currentPage = p; },
    getNodeByIdAsync: async (id) => { const n = BY_ID.get(id); return n && !n.removed ? n : null; }, loadFontAsync: async () => {}, commitUndo() { log.commits.push(COUNT.mut); },
    createPage: () => { const p = new MockNode('PAGE'); root.appendChild(p); return p; },
    createFrame: () => new MockNode('FRAME'), createSection: () => new MockNode('SECTION'), createText: () => new MockNode('TEXT'),
  };
  if (opts && opts.undo) figma.triggerUndo = () => { log.undo += 1; };
  const sb = { figma, __html__: '<html/>', console };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(bundle, 'utf8'), sb);
  const call = async (name, args) => {
    msgs.length = 0;
    await figma.ui.onmessage({ type: 'PLUGIN_CMD', cmd: { id: 'c', name, args: args || {} } });
    return msgs.find((m) => m.type === 'PLUGIN_RESULT').result;
  };
  const ok = async (name, args) => {
    const r = await call(name, args);
    assert.equal(r.ok, true, name + ': ' + r.error);
    return r.value;
  };
  return { call, ok, log };
}

const { all, tag, named, frameOf, shape, checkHug } = U;
const ALL = ['g1-a', 'g1-b', 'g1-c', 'g1-d', 'g1-e', 'g2-a', 'g2-b', 'g3-a', 'g3-b', 'g3-c'];
const A = (ids) => ({ screenIds: ids || ALL, themes: ['light'] });
const eq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);
const newRoot = (name) => { const r = new MockNode('DOCUMENT'); const p = new MockNode('PAGE'); p.name = name || 'Page 1'; r.appendChild(p); return r; };
const pageOf = (root) => root.children.find((p) => p.name === 'Tính năng');
const mine = (root) => all(root).filter((n) => n.type === 'FRAME' && tag(n, 'source'));
const dump = (root) => JSON.stringify(all(root).map((n) => [n.id, n.type, n.name, n.x, n.y, n.width, n.height, n._pd, n.characters]));

const SHAPE1 = [
  ['KHU A', [
    ['Nhóm 1', [['LUỒNG MỘT', ['g1-a', 'g1-b']], ['LUỒNG HAI', ['g1-c']], ['LUỒNG BA', ['g1-d']], ['LUỒNG BỐN', ['g1-e']]]],
    ['Nhóm 3', [['LUỒNG ĐẦU', ['g3-c']], ['LUỒNG P', ['g3-a', 'g3-b']]]],
  ]],
  ['KHU B', [['Nhóm 2', [['LUỒNG X', ['g2-a', 'g2-b']]]]]],
];

// Cấu trúc 4 cấp, tên/thứ tự (nhóm xen kẽ khu: Nhóm 3 thuộc KHU A dù order 3 sau KHU B order 2), màu từng cấp, bố cục kệ, ôm nội dung.
async function testStructure(t1) {
  const root = newRoot();
  const env = open(t1, root);
  const r = await env.ok('updateDraft', A());
  assert.equal(r.mode, 'tree');
  const page = pageOf(root);
  eq(shape(page), SHAPE1, 'Khu → nhóm → luồng → màn');
  eq(page.children.map((n) => n.type), ['SECTION', 'SECTION'], 'Trang chỉ có 2 Section khu, không container');
  checkHug(page, 60);
  const areaA = named(page, 'KHU A');
  const areaB = named(page, 'KHU B');
  assert.ok(areaB.y >= areaA.y + areaA.height, 'Khu xếp dọc, không đè');
  const g1 = named(areaA, 'Nhóm 1');
  const [mot, hai, ba, bon] = ['LUỒNG MỘT', 'LUỒNG HAI', 'LUỒNG BA', 'LUỒNG BỐN'].map((n) => named(g1, n));
  assert.ok(mot.y === hai.y && hai.y === ba.y && mot.x < hai.x && hai.x < ba.x, 'Luồng ngắn đứng cạnh nhau trên một hàng (tối đa flowCols luồng đầy đủ)');
  assert.ok(bon.y > ba.y && bon.x === mot.x, 'Hết bề rộng một hàng thì xuống hàng');
  assert.ok(g1.width <= 2 * 60 + 2 * 532 + 80 && g1.width > 532 + 120, 'Nhóm rộng tối đa 2 luồng đầy đủ');
  assert.ok(named(areaA, 'Nhóm 3').y >= g1.y + g1.height, 'Nhóm trong khu xếp dọc theo order');
  const fills = ['area', 'group', 'flow'].map((l) => U.levelOf(page, l)[0].fills[0]);
  assert.equal(new Set(fills.map((f) => JSON.stringify(f.color))).size, 3, 'Mỗi cấp một màu khác nhau');
  assert.ok(fills.every((f) => f.type === 'SOLID' && f.color.r >= 0.7 && f.color.g >= 0.8 && f.color.b >= 0.9 && f.color.b > f.color.r), 'Xanh nhạt, đủ sáng để tên Section đọc rõ');
  assert.ok(fills[0].color.r < fills[1].color.r && fills[1].color.r < fills[2].color.r, 'Đậm dần từ trong ra ngoài: khu > nhóm > luồng');
  for (const f of mine(root)) assert.ok(f.parent.getPluginData('treeLevel') === 'flow' && U.labelsOf(f.parent, f).length === 2, 'Nhãn text phụ vẫn còn trên khung');
  const snap = dump(root);
  const r2 = await open(t1, root).ok('updateDraft', A());
  assert.equal(r2.builtCount, 0);
  assert.equal(dump(root), snap, 'Chạy lặp ổn định từng byte');
}

// Bố cục cũ: dựng cây rồi đưa khung về container Hiện tại / Section nhóm cũ như bản trước tạo ra.
function downgrade(root, mode) {
  const page = pageOf(root);
  const frames = mine(root);
  const labels = all(root).filter((n) => n.type === 'TEXT' && tag(n, 'role') === 'screenLabel');
  const shell = mode === 'container'
    ? Object.assign(new MockNode('FRAME'), { name: 'Hiện tại', height: 9000 })
    : Object.assign(new MockNode('SECTION'), { name: 'Hiện tại' });
  if (mode === 'container') { shell.setPluginData('role', 'container'); shell.setPluginData('kind', 'current'); }
  const groups = {};
  const place = (f) => {
    if (mode === 'container') return shell;
    const gid = tag(f, 'groupId');
    if (!groups[gid]) {
      const area = groups.area || (groups.area = Object.assign(new MockNode('SECTION'), { name: 'Sáng' }));
      if (!area.parent) shell.appendChild(area);
      area.setPluginData('riseseed.themeArea', 'light');
      groups[gid] = Object.assign(new MockNode('SECTION'), { name: 'Cũ ' + gid });
      groups[gid].setPluginData('groupId', gid);
      area.appendChild(groups[gid]);
    }
    return groups[gid];
  };
  const where = new Map(frames.map((f) => [f, place(f)]));
  frames.forEach((f, i) => { where.get(f).appendChild(f); f.x = (i % 3) * 300; f.y = Math.floor(i / 3) * 500; });
  labels.forEach((l) => where.get(BY_ID.get(l.getPluginData('labelFor'))).appendChild(l));
  if (mode === 'container') {
    const deco = Object.assign(new MockNode('TEXT'), { name: 'Hiện tại' });
    deco.setPluginData('role', 'label');
    shell.appendChild(deco);
  }
  U.levelOf(page, 'area').forEach((a) => a.remove());
  page.appendChild(shell);
  return { shell, groups, frames };
}

async function legacyMigration(t1, mode, withDesigner) {
  const root = newRoot();
  await open(t1, root).ok('updateDraft', A());
  const edited = frameOf(root, 'g1-c')[0];
  edited.children[0].characters = 'Sửa tay';
  await open(t1, root).ok('updateDraft', A()); // gắn human cho khung đã sửa trước khi hạ cấp
  const before = mine(root);
  const ids = before.map((f) => f.id).sort();
  const { shell, groups } = downgrade(root, mode);
  const designer = withDesigner ? Object.assign(new MockNode('FRAME'), { name: 'Của designer', x: 7, y: 9 }) : null;
  if (designer) (mode === 'container' ? shell : groups[tag(frameOf(root, 'g2-a')[0], 'groupId')]).appendChild(designer);
  const env = open(t1, root);
  const pv = await env.ok('previewSync', A());
  assert.equal(pv.summary.counts.skip, ALL.length - 1, 'Xem trước nhìn thấy khung ở bố cục cũ: không báo dựng mới');
  const r = await env.ok('updateDraft', A());
  return { root, env, r, before, ids, shell, designer, edited };
}

async function testMigrate(t1, mode) {
  const { root, r, before, ids, shell, edited } = await legacyMigration(t1, mode, false);
  eq(mine(root).map((f) => f.id).sort(), ids, 'Không mất, không nhân đôi khung');
  assert.ok(before.every((f) => !f.removed), 'Khung được di chuyển, không dựng lại');
  assert.equal(r.builtCount, 0, 'Merge nói skip thì không dựng lại');
  eq([r.merge.counts.skip, r.merge.counts.replace, r.merge.counts.create], [ALL.length - 1, 0, 0]);
  assert.equal(r.merge.counts.keepEdit, 1);
  assert.equal(edited.children[0].characters, 'Sửa tay', 'Khung sửa tay chỉ di chuyển, nội dung giữ nguyên');
  assert.equal(r.movedCount, ALL.length);
  if (mode === 'container') assert.ok(shell.removed, 'Container cũ đã trống thì bị xoá');
  else eq(shell.children.map((n) => n.name), ['KHU A', 'KHU B'], 'Gốc Hiện tại giữ lại, chỉ còn cây Section (vùng Sáng + Section nhóm cũ đã bị xoá)');
  assert.ok(!all(root).some((n) => /Cũ g|Sáng/.test(n.name)), 'Section nhóm/vùng cũ trống đã bị xoá');
  const top = mode === 'container' ? pageOf(root) : shell;
  eq(shape(top).map((a) => a[0]), ['KHU A', 'KHU B']);
  assert.ok(r.cleanup.notes.some((t) => /Đã chuyển 10 khung/.test(t)) && r.cleanup.notes.some((t) => /Đã xoá \d+ vỏ/.test(t)), r.cleanup.notes.join('|'));
  checkHug(top, 60);
  const snap = dump(root);
  const r2 = await open(t1, root).ok('updateDraft', A());
  assert.equal(r2.movedCount, 0);
  assert.equal(dump(root), snap, 'Lượt lặp sau di chuyển ổn định');
}

async function testDesignerBlocks(t1, mode) {
  const { root, r, designer, before } = await legacyMigration(t1, mode, true);
  const holder = designer.parent;
  assert.ok(!designer.removed && holder && !holder.removed, 'Node không tag của designer không bị xoá, vỏ chứa nó được giữ');
  assert.deepEqual([designer.x, designer.y], [7, 9], 'Node designer không bị dời');
  assert.ok(r.cleanup.notes.some((t) => /Giữ lại .*1 node không phải của plugin/.test(t)), 'Báo vỏ cũ bị chặn: ' + r.cleanup.notes.join('|'));
  assert.ok(before.every((f) => !f.removed && f.parent.getPluginData('treeLevel') === 'flow'), 'Khung plugin vẫn được chuyển hết vào luồng');
  assert.ok(all(holder).filter((n) => tag(n, 'screenId')).length === 0 && !holder.getPluginData('treeLevel'), 'Vỏ cũ không còn khung plugin');
  const snap = dump(root);
  const again = await open(t1, root).ok('updateDraft', A());
  assert.equal(again.movedCount, 0);
  assert.equal(dump(root), snap, 'Vỏ cũ bị chặn: chạy lặp vẫn ổn định');
  assert.ok(again.cleanup.notes.some((t) => /Giữ lại/.test(t)), 'Lượt lặp vẫn báo');
}

// Hoàn tác bản không có triggerUndo: đưa khung về cha cũ khi cha còn (cha cũ đã bị xoá vì trống thì khung ở lại cây), không mất khung nào.
async function testUndo(t1) {
  const f = await legacyMigration(t1, 'section', true);
  assert.equal(f.env.log.commits.length, 1, 'Một lượt Cập nhật = đúng 1 commitUndo');
  const holder = f.designer.parent;
  const run = await f.env.ok('rollbackDraft');
  assert.equal(run.mode, 'batch', 'Bản không triggerUndo');
  assert.ok(f.before.every((x) => !x.removed), 'Không mất khung nào');
  assert.ok(['g2-a', 'g2-b'].every((id) => frameOf(f.root, id)[0].parent === holder), 'Khung đưa về Section nhóm cũ còn sống (có node designer)');
  assert.ok(U.levelOf(f.root, 'flow').every((n) => n.children.length > 0), 'Section luồng trống sau hoàn tác bị dọn');
  assert.ok(!holder.removed && f.designer.parent === holder);
  const again = await f.env.call('rollbackDraft');
  assert.equal(again.ok, false, 'Hoàn tác xong tự khoá');
}

async function testUndoNative(t1) {
  const f = await legacyMigration(t1, 'container', false);
  const root = f.root;
  const env = open(t1, root, { undo: true });
  const downgraded = downgrade(root, 'container');
  const before = COUNT.mut;
  const r = await env.ok('updateDraft', A());
  assert.equal(r.movedCount, ALL.length);
  assert.equal(r.builtCount, 0);
  assert.equal(env.log.commits.length, 1, 'Cả lượt (di chuyển + merge + dọn + xếp lại) là đúng 1 bước undo');
  assert.equal(env.log.commits[0], COUNT.mut, 'Không có thay đổi nào sau commitUndo');
  assert.ok(COUNT.mut > before && downgraded.shell.removed);
  const u = await env.ok('rollbackDraft');
  assert.equal(u.mode, 'undo');
  assert.equal(env.log.undo, 1, 'Dùng triggerUndo của Figma: gỡ trọn cả di chuyển lẫn dọn');
  const again = await env.call('rollbackDraft');
  assert.equal(again.ok, false, 'Hoàn tác xong tự khoá');
}

// Plan 2 (đổi khu/luồng): lượt chỉ build g2-a vẫn xếp lại cả nhóm ngoài lô (g1, g3) theo groupOrders + screenFlows mới.
async function testReorder(t1, t2) {
  const root = newRoot();
  await open(t1, root).ok('updateDraft', A());
  const ids = mine(root).map((f) => f.id).sort();
  const all1 = mine(root);
  const r = await open(t2, root).ok('updateDraft', A(['g2-a']));
  const page = pageOf(root);
  eq(shape(page), [
    ['KHU B', [
      ['Nhóm 1', [['LUỒNG MỘT', ['g1-a', 'g1-b', 'g1-e']], ['LUỒNG HAI', ['g1-c']], ['LUỒNG BA', ['g1-d']]]],
      ['Nhóm 3', [['LUỒNG ĐẦU', ['g3-c']], ['LUỒNG P', ['g3-a', 'g3-b']]]],
    ]],
    ['KHU A', [['Nhóm 2', [['LUỒNG X', ['g2-a', 'g2-b']]]]]],
  ], 'Khu xếp theo order nhỏ nhất của khu (KHU B có nhóm order 1), nhóm ngoài lô được xếp lại, luồng cũ trống bị xoá');
  eq(mine(root).map((f) => f.id).sort(), ids, 'Không mất/nhân đôi khung');
  assert.ok(all1.every((f) => !f.removed), 'Chỉ di chuyển');
  assert.equal(r.merge.counts.skip, 1);
  assert.ok(r.movedCount >= 6, 'Khung nhóm ngoài lô được chuyển: ' + r.movedCount);
  assert.equal(U.levelOf(page, 'area').length, 2);
  assert.ok(named(page, 'KHU B').y < named(page, 'KHU A').y);
  checkHug(page, 60);
}

(async () => {
  const [t1, t2] = process.argv.slice(2);
  await testStructure(t1);
  for (const mode of ['container', 'section']) {
    await testMigrate(t1, mode);
    await testDesignerBlocks(t1, mode);
  }
  await testUndo(t1);
  await testUndoNative(t1);
  await testReorder(t1, t2);
  console.log('verify_tree.js: OK (cây khu → nhóm → luồng, di chuyển từ bố cục cũ, hoàn tác, sắp xếp lại)');
})().catch((e) => { console.error(e); process.exit(1); });

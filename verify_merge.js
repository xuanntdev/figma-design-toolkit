// Kiểm merge 3 chiều theo màn (bảng skip / replace / keepEdit / conflict), frame bản cũ không srcHash, giải xung đột,
// chạy lặp ổn định, build lô khác nhau. Chạy: node verify_merge.js <v1/code.js> <v1b/code.js> <v2/code.js>
//   v1 = extension thử; v1b = cùng extension nhưng plan khác (lô khác); v2 = nguồn màn g1-b và g1-d đổi (h +10).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const os = require('node:os');
const path = require('node:path');
const { strictNode, markRemoved } = require('./tests/strict-node.js');

let seq = 1;
const BY_ID = new Map();
class MockNode {
  constructor(type) {
    Object.assign(this, { id: 'N' + seq++, type, name: type, children: [], parent: null, x: 0, y: 0, width: 100, height: type === 'TEXT' ? 24 : 100, fills: [], strokes: [], _pd: {} });
    const proxy = strictNode(this);
    BY_ID.set(this.id, proxy);
    return proxy;
  }
  getPluginData(k) { return this._pd[k] || ''; }
  setPluginData(k, v) { this._pd[k] = String(v); }
  resize(w, h) { this.width = w; this.height = h; }
  appendChild(ch) {
    if (ch.parent) ch.parent.children = ch.parent.children.filter((x) => x !== ch);
    ch.parent = this;
    this.children.push(ch);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
    this.parent = null;
    markRemoved(this);
  }
}

// Mở plugin (bundle) trên một cây node có sẵn: mỗi lần mở là một phiên mới (trạng thái trong bộ nhớ plugin mất).
function open(bundle, root) {
  const msgs = [];
  const zoomed = [];
  const figma = {
    root, currentPage: root.children[0], ui: { onmessage: null, postMessage: (m) => msgs.push(m) }, showUI() {}, closePlugin() {},
    loadAllPagesAsync: async () => {}, setCurrentPageAsync: async (p) => { figma.currentPage = p; },
    getNodeByIdAsync: async (id) => BY_ID.get(id) || null, loadFontAsync: async () => {}, commitUndo() {},
    viewport: { scrollAndZoomIntoView: (nodes) => zoomed.push(nodes.map((n) => n.id)) },
    createPage: () => { const p = new MockNode('PAGE'); root.appendChild(p); return p; },
    createFrame: () => new MockNode('FRAME'), createSection: () => new MockNode('SECTION'), createText: () => new MockNode('TEXT'),
  };
  figma.currentPage.selection = [];
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
  return { figma, call, ok, zoomed };
}

// Kết quả từ phiên plugin (vm) là đối tượng khác realm: so bằng JSON.
const eq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
function same(a, b, msg) {
  const x = JSON.parse(a);
  const y = JSON.parse(b);
  const i = x.findIndex((row, k) => JSON.stringify(row) !== JSON.stringify(y[k]));
  assert.ok(i < 0 && x.length === y.length, msg + ' | ' + (i < 0 ? x.length + '≠' + y.length : JSON.stringify(x[i]) + ' ≠ ' + JSON.stringify(y[i])));
}
const all = (node) => node.children.flatMap((c) => [c, ...all(c)]);
// Khung màn nằm trong cây Section: tìm trong toàn cây dưới `parent`; nhãn nằm cùng cha với khung.
const frameOf = (parent, id) => all(parent).filter((n) => n.type === 'FRAME' && n.getPluginData('screenId') === id);
const labelsOf = (parent, f) => f.parent.children.filter((n) => n.type === 'TEXT' && n.getPluginData('labelFor') === f.id);
// Chỉ khung màn + nhãn màn (phần decor tiêu đề/ô giữ chỗ do ensureLayout vẽ lại mỗi lượt nên id đổi).
const real = (n) => !['label', 'placeholder'].includes(n.getPluginData('role')) && !(n.parent && n.parent.getPluginData('role') === 'placeholder');
const dump = (root) => JSON.stringify(all(root).filter(real).map((n) => [n.id, n.type, n.name, n.x, n.y, n.width, n.height, n._pd, n.characters, n.strokes]));
const A = (ids) => ({ screenIds: ids, themes: ['light'], target: 'current' });
const ids = (list) => list.map((x) => x.screenId).sort();
const curOf = (root) => root.children.find((p) => p.name === 'Tính năng');
const has = (cur, n) => !n.removed && all(cur).includes(n);

async function testTable(v1, v1b, v2) {
  const root = new MockNode('DOCUMENT');
  root.appendChild(new MockNode('PAGE'));
  const ALL = ['g1-a', 'g1-b', 'g1-c', 'g1-d', 'g1-e', 'g2-a'];
  let env = open(v1, root);
  const pre = await env.ok('previewSync', A(ALL));
  assert.equal(pre.summary.counts.create, 6, 'Chưa có gì: xem trước báo dựng mới cả 6');
  const r1 = await env.ok('updateDraft', A(ALL));
  assert.equal(r1.merge.counts.create, 6);
  const cur = curOf(root);
  const stamped = frameOf(cur, 'g1-a')[0];
  assert.ok(stamped.getPluginData('srcHash') && stamped.getPluginData('fp') && stamped.getPluginData('buildHash'), 'Khung dựng phải có fp + srcHash + buildHash');

  // Lượt 2 cùng nguồn (phiên mới, bundle khác lô nhưng cùng bộ dựng): bỏ qua hết, không dựng lại.
  const before = dump(root);
  env = open(v1b, root);
  const pre2 = await env.ok('previewSync', A(ALL));
  assert.equal(pre2.summary.counts.skip, 6);
  same(dump(root), before, 'Xem trước không được ghi gì vào Figma');
  const r2 = await env.ok('updateDraft', A(['g1-a', 'g1-c', 'g1-b', 'g1-d', 'g1-e', 'g2-a']));
  assert.equal(r2.merge.counts.skip, 6, 'Giống/giống: bỏ qua');
  assert.equal(r2.builtCount, 0);
  same(dump(root), before, 'Bỏ qua = không đổi từng byte');

  // Sửa tay c, d + giả lập bản cũ: e không srcHash (nguyên bản), g2-a không srcHash và đã sửa.
  const [a0, b0, c0, d0, e0, g0] = ['g1-a', 'g1-b', 'g1-c', 'g1-d', 'g1-e', 'g2-a'].map((id) => frameOf(cur, id)[0]);
  c0.children[0].characters = 'Sửa c';
  d0.children[0].characters = 'Sửa d';
  for (const f of [e0, g0]) { f.setPluginData('srcHash', ''); f.setPluginData('buildHash', ''); }
  g0.children[0].characters = 'Sửa g';

  env = open(v2, root);
  const pv = await env.ok('previewSync', A(ALL));
  const it = pv.summary.items;
  eq([ids(it.skip), ids(it.replace), ids(it.keepEdit), ids(it.conflict)], [['g1-a'], ['g1-b', 'g1-e'], ['g1-c', 'g2-a'], ['g1-d']], JSON.stringify(pv.summary.counts));
  assert.equal(it.keepEdit.find((x) => x.screenId === 'g2-a').draft, true, 'Bản cũ đã sửa không base: giữ + bản mới cạnh');
  const r3 = await env.ok('updateDraft', A(ALL));
  eq(r3.merge.counts, { skip: 1, create: 0, replace: 2, keepEdit: 2, conflict: 1 });
  assert.equal(frameOf(cur, 'g1-a')[0], a0, 'skip: đúng khung cũ');
  assert.ok(b0.removed && frameOf(cur, 'g1-b').length === 1 && frameOf(cur, 'g1-b')[0].height === 310, 'replace: thay bằng bản mới');
  assert.ok(e0.removed && frameOf(cur, 'g1-e').length === 1, 'Bản cũ không srcHash nhưng nguyên bản: thay');
  eq([frameOf(cur, 'g1-c').length, c0.children[0].characters, c0.getPluginData('source')], [1, 'Sửa c', 'human'], 'keepEdit: giữ, không dựng nháp mới');
  assert.equal(frameOf(cur, 'g2-a').length, 2, 'Bản cũ đã sửa: bản mới nằm cạnh');
  assert.ok(frameOf(cur, 'g2-a')[0].parent === frameOf(cur, 'g2-a')[1].parent, 'Cùng Section luồng');
  assert.equal(g0.children[0].characters, 'Sửa g');
  const dpair = frameOf(cur, 'g1-d');
  const d1 = dpair.find((f) => f !== d0);
  assert.equal(dpair.length, 2);
  assert.equal(d0.children[0].characters, 'Sửa d', 'Xung đột: bản sửa tay giữ nguyên');
  eq([d0.getPluginData('conflict'), d1.getPluginData('conflictOf')], ['1', d0.id]);
  assert.ok(d0.strokes[0].color.r > 0.7 && d1.strokes[0].color.r > 0.7, 'Viền đỏ cả hai khung');
  for (const f of [d0, d1]) {
    const l = labelsOf(cur, f).find((n) => n.getPluginData('part') === 'conflict');
    assert.ok(l && /Xung đột/.test(l.characters), 'Nhãn Xung đột trên canvas');
  }
  const exported = (await env.ok('exportEdits')).items;
  const ec = exported.find((x) => x.screenId === 'g1-c');
  eq(exported.map((x) => x.screenId).sort(), ['g1-c', 'g1-d', 'g2-a']);
  assert.ok(ec.code && ec.title && ec.fp && ec.srcHash && ec.groupId === 'g1', JSON.stringify(ec));
  eq(ec.texts, { added: ['Sửa c'], removed: ['M c'] });
  assert.equal(exported.find((x) => x.screenId === 'g1-d').conflict, true);

  // Chạy lặp: không dựng lại, không nhân đôi, cặp xung đột giữ nguyên.
  const snap = dump(root);
  const r4 = await open(v2, root).ok('updateDraft', A(ALL));
  assert.equal(r4.builtCount, 0, 'Lượt lặp không dựng gì');
  assert.equal(r4.merge.counts.conflict, 1);
  same(dump(root), snap, 'Lượt lặp ổn định từng byte');

  await testResolveMine(v2, root, cur, d0, d1);
}

async function testResolveMine(v2, root, cur, d0, d1) {
  const env = open(v2, root);
  const { conflicts } = await env.ok('listConflicts');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].keepId, d0.id);
  assert.match(conflicts[0].text, /^1\.04 · M d$/);
  await env.ok('focusConflict', conflicts[0]);
  eq(env.zoomed, [[d0.id, d1.id]], 'Zoom tới cặp khung');
  assert.equal(frameOf(cur, 'g1-d').length, 2, 'Chưa chọn thì không xoá gì');
  const res = await env.ok('resolveConflict', { keepId: d0.id, newId: d1.id, choice: 'mine' });
  assert.equal(res.remaining, 0);
  assert.ok(d1.removed && has(cur, d0), 'Giữ bản sửa tay: xoá bản mới');
  eq([d0.getPluginData('conflict'), d0.strokes.length, d0.children[0].characters], ['', 0, 'Sửa d'], 'Gỡ dấu, trả lại viền cũ');
  assert.equal(labelsOf(cur, d0).filter((n) => n.getPluginData('part') === 'conflict').length, 0);
  const r = await open(v2, root).ok('updateDraft', A(['g1-d']));
  eq([r.merge.counts.keepEdit, r.merge.counts.conflict, r.builtCount], [1, 0, 0], 'Lần sau không báo lại xung đột');
  assert.equal(frameOf(cur, 'g1-d').length, 1);
}

async function conflictFixture(v1, v2, parentPage) {
  const root = new MockNode('DOCUMENT');
  root.appendChild(parentPage || new MockNode('PAGE'));
  await open(v1, root).ok('updateDraft', A(['g1-b']));
  const hand = all(root).find((n) => n.type === 'FRAME' && n.getPluginData('screenId') === 'g1-b');
  hand.children[0].characters = 'Tay';
  const env = open(v2, root);
  const r = await env.ok('updateDraft', A(['g1-b']));
  assert.equal(r.merge.counts.conflict, 1);
  const list = hand.parent.children.filter((n) => n.type === 'FRAME' && n.getPluginData('screenId') === 'g1-b');
  return { root, env, hand, draft: list.find((f) => f !== hand), parent: hand.parent };
}

async function testResolveTheirs(v1, v2) {
  const f = await conflictFixture(v1, v2);
  const args = { keepId: f.hand.id, newId: f.draft.id, choice: 'theirs' };
  const bad = await f.env.call('resolveConflict', args);
  assert.equal(bad.ok, false, 'Lấy bản mới phải có xác nhận rõ ràng');
  assert.ok(!f.hand.removed, 'Chưa xác nhận thì bản sửa tay còn');
  const spot = [f.hand.x, f.hand.y];
  await f.env.ok('resolveConflict', Object.assign({ confirm: true }, args));
  assert.ok(f.hand.removed && !f.draft.removed);
  eq([f.draft.getPluginData('conflict'), f.draft.getPluginData('source'), f.draft.strokes.length], ['', 'ai', 0]);
  eq([f.draft.x, f.draft.y], spot, 'Bản mới thế chỗ bản sửa tay');
  const r = await open(v2, f.root).ok('updateDraft', A(['g1-b']));
  eq([r.merge.counts.skip, r.builtCount], [1, 0], 'Bản mới thành chính, lần sau bỏ qua');
}

async function testRollbackConflict(v1, v2) {
  const f = await conflictFixture(v1, v2);
  const env = f.env;
  const undo = await env.ok('rollbackDraft');
  assert.ok(f.draft.removed && !f.hand.removed, 'Hoàn tác gỡ bản mới, giữ bản sửa tay');
  eq([f.hand.getPluginData('conflict'), f.hand.strokes.length], ['', 0], 'Hoàn tác gỡ cả dấu xung đột');
  assert.ok(undo.rolledBackCount >= 1);
}

async function testSectionMode(v1, v2) {
  const page = new MockNode('PAGE');
  page.appendChild(Object.assign(new MockNode('SECTION'), { name: 'Hiện tại' }));
  const f = await conflictFixture(v1, v2, page);
  assert.equal(f.parent.type, 'SECTION');
  assert.ok(f.draft.parent === f.hand.parent && f.draft.y === f.hand.y && f.draft.x === f.hand.x + f.hand.width + 56, 'Cặp xung đột nằm cạnh nhau trong cùng Section luồng');
  assert.ok(labelsOf(f.parent, f.hand).some((n) => n.getPluginData('part') === 'conflict'));
  const pv = await f.env.ok('previewSync', A(['g1-b']));
  assert.equal(pv.summary.counts.conflict, 1);
  const again = await f.env.ok('updateDraft', A(['g1-b']));
  assert.equal(again.builtCount, 0, 'Section: lượt lặp ổn định');
  assert.equal(f.parent.children.filter((n) => n.type === 'FRAME').length, 2);
}

// Bản sao bundle với BUILDER_HASH đặt theo `hash` (v2 chỉ khác dữ liệu nguồn; mã bộ dựng coi như không đổi).
function withHash(file, hash) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'merge-')), 'code.js');
  fs.writeFileSync(out, fs.readFileSync(file, 'utf8').replace(/const BUILDER_HASH = "\w*";/, 'const BUILDER_HASH = "' + hash + '";'));
  return out;
}

const hashOf = (file) => fs.readFileSync(file, 'utf8').match(/const BUILDER_HASH = "(\w*)";/)[1];

// Đổi mã bộ dựng (không đổi nguồn): khung chưa sửa dựng lại, khung đã sửa vẫn giữ và KHÔNG báo xung đột.
async function testBuilderChange(v1) {
  const root = new MockNode('DOCUMENT');
  root.appendChild(new MockNode('PAGE'));
  await open(v1, root).ok('updateDraft', A(['g1-a', 'g1-c']));
  const cur = curOf(root);
  const [a0, c0] = ['g1-a', 'g1-c'].map((id) => frameOf(cur, id)[0]);
  c0.children[0].characters = 'Sửa c';
  const r = await open(withHash(v1, 'deadbeef0000'), root).ok('updateDraft', A(['g1-a', 'g1-c']));
  eq([r.merge.counts.replace, r.merge.counts.keepEdit, r.merge.counts.conflict], [1, 1, 0]);
  assert.ok(a0.removed && has(cur, c0) && c0.children[0].characters === 'Sửa c');
}

(async () => {
  const [v1, v1b, v2raw] = process.argv.slice(2);
  const v2 = withHash(v2raw, hashOf(v1));
  await testBuilderChange(v1);
  await testTable(v1, v1b, v2);
  await testResolveTheirs(v1, v2);
  await testRollbackConflict(v1, v2);
  await testSectionMode(v1, v2);
  console.log('verify_merge.js: OK (4 ô bảng, bản cũ không srcHash, giải xung đột, lặp ổn định, lô khác nhau, Section)');
})().catch((e) => { console.error(e); process.exit(1); });

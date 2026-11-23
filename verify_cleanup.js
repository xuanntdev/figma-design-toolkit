// Kiểm dọn khu thừa mỗi lượt Cập nhật (improved=false, plan chỉ có light): khu "Cải tiến", vùng/ô/nhãn/ô giữ chỗ "Tối" do
// bản cũ tạo bị xoá; node được bảo vệ (human/chosen) hoặc không tag (designer vẽ) thì giữ + có thông báo; chạy lặp ổn định.
// Khung của plugin ở bố cục cũ được chuyển vào cây Section (khu → nhóm → luồng); vỏ cũ chỉ bị xoá khi đã trống.
// Chạy: node verify_cleanup.js <code.js dựng với plan { themes: ['light'], groupOrders: { gx: {...} } }>.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { strictNode, markRemoved } = require('./tests/strict-node.js');
const U = require('./tests/tree-util.js');

let seq = 1;
class MockNode {
  constructor(type) {
    Object.assign(this, { id: 'N' + seq++, type, name: type, children: [], parent: null, x: 0, y: 0, width: 100, height: type === 'TEXT' ? 24 : 100, fills: [], strokes: [], _pd: {} });
    return strictNode(this);
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

function boot(bundle, pages) {
  const root = new MockNode('DOCUMENT');
  pages.forEach((p) => root.appendChild(p));
  const msgs = [];
  const figma = {
    root, currentPage: pages[0], ui: { onmessage: null, postMessage: (m) => msgs.push(m) }, showUI() {}, closePlugin() {},
    loadAllPagesAsync: async () => {}, setCurrentPageAsync: async (p) => { figma.currentPage = p; },
    getNodeByIdAsync: async () => null, loadFontAsync: async () => {}, commitUndo() {},
    createPage: () => { const p = new MockNode('PAGE'); root.appendChild(p); return p; },
    createFrame: () => new MockNode('FRAME'), createSection: () => new MockNode('SECTION'), createText: () => new MockNode('TEXT'),
  };
  const sb = { figma, __html__: '<html/>', console };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(bundle, 'utf8'), sb);
  const call = async (name, args) => {
    msgs.length = 0;
    await figma.ui.onmessage({ type: 'PLUGIN_CMD', cmd: { id: 'c', name, args: args || {} } });
    return msgs.find((m) => m.type === 'PLUGIN_RESULT').result;
  };
  return { root, call };
}

function mk(type, name, tags, parent, geo) {
  const n = Object.assign(new MockNode(type), { name }, geo || {});
  if (type === 'FRAME' && (tags || {}).source === 'ai') n.appendChild(new MockNode('TEXT')); // ruột giống bản plugin dựng
  for (const k of Object.keys(tags || {})) n.setPluginData(k, tags[k]);
  if (parent) parent.appendChild(n);
  return n;
}

const all = (node) => node.children.flatMap((c) => [c, ...all(c)]);
const AREA = 'riseseed.themeArea';
const UPD = { screenIds: ['g1-a'], themes: ['light', 'dark'] };

// File dựng bằng bản cũ: container Hiện tại có ô/nhãn/ô giữ chỗ Tối + container Cải tiến.
function oldContainerFile() {
  const page = mk('PAGE', 'Tính năng');
  const cur = mk('FRAME', 'Hiện tại', { role: 'container', kind: 'current' }, page, { height: 9000 });
  const imp = mk('FRAME', 'Cải tiến', { role: 'container', kind: 'improved' }, page, { x: 5000 });
  const cell = (theme, name) => mk('FRAME', name, { role: 'cell', source: 'ai', status: 'draft', screenId: 'g1-a', theme, groupId: 'g1' }, cur);
  cell('light', 'g1-a · light');
  const dark = cell('dark', 'g1-a · dark');
  mk('TEXT', 'M a', { role: 'screenLabel', labelFor: dark.id, labelScreen: 'g1-a', theme: 'dark', part: 'title' }, cur);
  mk('FRAME', 'Chưa có ảnh chụp · g1-b · dark', { role: 'placeholder', screenId: 'g1-b', theme: 'dark' }, cur);
  mk('TEXT', 'Nhóm 1 · Tối', { role: 'label' }, cur);
  mk('FRAME', 'g1-a · light', { source: 'ai', status: 'draft', screenId: 'g1-a', theme: 'light' }, imp);
  mk('TEXT', 'Cải tiến', { role: 'label' }, imp);
  return { page, cur };
}

async function testContainer(bundle) {
  const { page, cur } = oldContainerFile();
  const env = boot(bundle, [page]);
  const r1 = await env.call('updateDraft', UPD);
  assert.equal(r1.ok, true, r1.error);
  assert.ok(r1.value.cleanup.removed.includes('Cải tiến'), 'Phải báo đã xoá Cải tiến');
  assert.deepEqual(page.children.map((n) => [n.type, n.name]), [['SECTION', 'KHÁC']], 'Container Hiện tại cũ đã trống thì bị xoá, còn lại cây Section');
  assert.ok(cur.removed, 'Container cũ phải bị xoá');
  const nodes = all(page);
  assert.ok(nodes.every((n) => n.getPluginData('theme') !== 'dark'), 'Không còn ô/nhãn/ô giữ chỗ dark');
  assert.ok(nodes.every((n) => !(n.type === 'TEXT' && /Tối/.test(n.characters || ''))), 'Không còn nhãn · Tối');
  assert.equal(U.frameOf(page, 'g1-a').length, 1, 'Ô light cũ được chuyển/thay, không nhân đôi');
  assert.equal(r1.value.merge.counts.replace + r1.value.merge.counts.create, 1);
  const snap = () => JSON.stringify(all(page).map((n) => [n.name, n.x, n.y, n.width, n.height]));
  const before = snap();
  const r2 = await env.call('updateDraft', UPD);
  assert.equal(r2.ok, true, r2.error);
  assert.equal(r2.value.cleanup.removed.length, 0, 'Lượt 2: không còn gì để dọn');
  assert.equal(snap(), before, 'Chạy 2 lần cho kết quả giống nhau');
}

function sectionFile(withKept) {
  const page = mk('PAGE', '01 · Màn hình');
  const cur = mk('SECTION', 'Hiện tại', {}, page);
  const light = mk('SECTION', 'Sáng', { [AREA]: 'light' }, cur);
  mk('FRAME', 'Tay', {}, mk('SECTION', 'Nhóm 1', { groupId: 'g1' }, light), { x: 60, y: 90 });
  const dark = mk('SECTION', 'Tối', { [AREA]: 'dark' }, cur);
  const dg = mk('SECTION', 'Nhóm 1', { groupId: 'g1' }, dark);
  mk('FRAME', 'g1-a · dark', { source: 'ai', status: 'draft', screenId: 'g1-a', theme: 'dark' }, dg);
  const imp = mk('SECTION', 'Cải tiến', {}, page);
  mk('SECTION', 'Sáng', { [AREA]: 'light' }, imp);
  mk('SECTION', 'Tối', {}, imp);
  if (withKept) {
    const grp = mk('SECTION', 'Nhóm 1', { currentGroupId: 'x' }, imp.children[0]);
    mk('FRAME', 'Người vẽ', { source: 'human', screenId: 'g1-a', theme: 'light' }, grp);
    mk('FRAME', 'Không tag', {}, grp);
    mk('FRAME', 'g1-a · light', { source: 'ai', status: 'draft', screenId: 'g1-a', theme: 'light' }, grp);
    mk('FRAME', 'g1-b · dark', { source: 'ai', status: 'chosen', screenId: 'g1-b', theme: 'dark' }, dg);
  }
  return { page, cur, imp, dark };
}

async function testSectionEmpty(bundle) {
  const f = sectionFile(false);
  f.dark.children[0].children[0].setPluginData('status', 'draft');
  const env = boot(bundle, [f.page]);
  const r = await env.call('updateDraft', UPD);
  assert.equal(r.ok, true, r.error);
  assert.ok(!f.page.children.includes(f.imp), 'Section Cải tiến (chỉ có vùng trống/nháp) phải bị xoá');
  assert.deepEqual(f.cur.children.map((n) => n.name), ['Sáng', 'KHÁC'], 'Vùng Tối phải bị xoá; Sáng còn vì có khung designer; cây mới được tạo');
  assert.ok(r.value.cleanup.notes.some((t) => /Đã xoá khu thừa: Tối/.test(t)), r.value.cleanup.notes.join('|'));
  assert.ok(r.value.cleanup.notes.some((t) => /Giữ lại "Sáng".*1 node/.test(t)), 'Báo vỏ cũ bị chặn bởi node designer');
  const r2 = await env.call('updateDraft', UPD);
  assert.equal(r2.ok, true, r2.error);
  assert.deepEqual(f.cur.children.map((n) => n.name), ['Sáng', 'KHÁC'], 'Lượt 2 không tạo lại vùng Tối');
  assert.equal(r2.value.cleanup.removed.length, 0);
}

async function testSectionKeepsHuman(bundle) {
  const f = sectionFile(true);
  const env = boot(bundle, [f.page]);
  const r = await env.call('updateDraft', UPD);
  assert.equal(r.ok, true, r.error);
  const names = all(f.imp).map((n) => n.name);
  assert.ok(f.page.children.includes(f.imp) && names.includes('Người vẽ') && names.includes('Không tag'), 'Giữ khung human + không tag');
  assert.ok(!names.includes('g1-a · light'), 'Bản nháp ai nguyên bản bị xoá');
  assert.ok(f.cur.children.includes(f.dark) && all(f.dark).some((n) => n.name === 'g1-b · dark'), 'Giữ khung chosen và vùng chứa nó');
  assert.ok(!all(f.dark).some((n) => n.name === 'g1-a · dark'), 'Bản nháp dark khác vẫn bị xoá');
  assert.ok(r.value.cleanup.notes.some((t) => /Giữ lại khu Cải tiến vì có 2 khung do designer tạo/.test(t)), r.value.cleanup.notes.join('|'));
  assert.ok(r.value.cleanup.notes.some((t) => /Tối/.test(t) && /1 khung/.test(t)));
  const snap = () => JSON.stringify([all(f.imp), all(f.dark)].map((l) => l.map((n) => n.name)));
  const before = snap();
  const r2 = await env.call('updateDraft', UPD);
  assert.equal(r2.ok, true, r2.error);
  assert.equal(snap(), before, 'Chạy lần 2 ổn định');
  assert.equal(JSON.stringify(r2.value.cleanup.notes), JSON.stringify(r.value.cleanup.notes.filter((t) => /^Giữ/.test(t))), 'Lần 2 vẫn báo giữ lại');
}

async function testThemesAndGroupOrders(bundle) {
  const page = mk('PAGE', 'Màn');
  const cur = mk('SECTION', 'Hiện tại', {}, page);
  const area = mk('SECTION', 'Sáng', { [AREA]: 'light' }, cur);
  const old = mk('SECTION', 'Tên cũ', { groupId: 'gx', groupOrder: '0', groupTitle: 'Tên cũ' }, area, { y: 0, height: 200 });
  mk('FRAME', 'gx-a', { source: 'ai', status: 'draft', screenId: 'gx-a', theme: 'light', groupId: 'gx', groupOrder: '0', groupTitle: 'Tên cũ' }, old);
  const env = boot(bundle, [page]);
  const r = await env.call('updateDraft', { screenIds: ['g1-a'], themes: ['dark'] });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(cur.children.map((n) => n.name), ['KHÁC'], 'Plan không có dark: yêu cầu dark không tạo vùng Tối; vùng Sáng cũ trống thì xoá');
  assert.ok(all(cur).every((n) => n.getPluginData('theme') !== 'dark'));
  const khac = cur.children[0];
  const seq = khac.children.sort((a, b) => a.y - b.y).map((n) => n.name);
  assert.deepEqual(seq, ['Nhóm 1', '3 · Mới'], 'Nhóm ngoài lô được chuyển vào cây, đổi tên + xếp theo order trong DRAFT_PLAN.groupOrders');
  const gx = U.named(khac, '3 · Mới');
  assert.equal(gx.getPluginData('treeOrder'), '3');
  assert.equal(U.frameOf(cur, 'gx-a')[0].getPluginData('groupOrder'), '3');
}

const frameOf = (parent, id) => parent.children.filter((n) => n.type === 'FRAME' && n.getPluginData('screenId') === id);
const flowOf = (root) => U.levelOf(root, 'flow')[0];
const hits = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Khung `ai` bị designer sửa tay (đổi chữ / đổi cỡ) mà không đổi tag: không xoá/ghi đè, retag human, bản nháp mới nằm cạnh.
async function testEditedContainer(bundle) {
  const env = boot(bundle, [mk('PAGE', 'Màn')]);
  const upd = () => env.call('updateDraft', { screenIds: ['g1-a', 'g1-b', 'g1-c'], themes: ['light'] });
  assert.equal((await upd()).ok, true);
  const cur = flowOf(env.root.children.find((p) => p.name === 'Tính năng'));
  const [a] = frameOf(cur, 'g1-a');
  const [b] = frameOf(cur, 'g1-b');
  const [c] = frameOf(cur, 'g1-c');
  a.children[0].characters = 'Designer sửa chữ';
  b.resize(b.width, b.height + 33);
  const r = await upd();
  assert.equal(r.ok, true, r.error);
  assert.equal(r.value.editedKept, 2, 'Báo giữ 2 màn đã sửa tay');
  assert.ok(cur.children.includes(a) && cur.children.includes(b) && a.children[0].characters === 'Designer sửa chữ', 'Khung đã sửa không bị xoá/ghi đè');
  assert.deepEqual([a.getPluginData('source'), a.getPluginData('edited')], ['human', '1']);
  assert.ok(cur.children.includes(c) && frameOf(cur, 'g1-c').length === 1, 'Khung nguyên bản, nguồn không đổi: bỏ qua, không dựng lại');
  assert.equal(r.value.merge.counts.skip, 1);
  assert.equal(r.value.merge.counts.keepEdit, 2, 'Sửa tay + nguồn không đổi: giữ bản sửa tay, không dựng bản nháp cạnh');
  assert.ok(['g1-a', 'g1-b'].every((id) => frameOf(cur, id).length === 1), 'Không có bản nháp mới cạnh khung đã sửa');
  const r3 = await upd();
  assert.equal(r3.ok, true, r3.error);
  assert.equal(frameOf(cur, 'g1-a').length, 1, 'Lượt 3 không nhân đôi');
  assert.equal(a.children[0].characters, 'Designer sửa chữ');
}

async function testEditedSection(bundle) {
  const page = mk('PAGE', 'Màn');
  mk('SECTION', 'Hiện tại', {}, page);
  const env = boot(bundle, [page]);
  const upd = () => env.call('updateDraft', { screenIds: ['g1-a'], themes: ['light'] });
  assert.equal((await upd()).ok, true);
  const grp = flowOf(page);
  const [a] = frameOf(grp, 'g1-a');
  a.children[0].characters = 'Sửa tay';
  const r = await upd();
  assert.equal(r.ok, true, r.error);
  assert.equal(r.value.editedKept, 1);
  assert.equal(frameOf(grp, 'g1-a').length, 1, 'Sửa tay + nguồn không đổi: giữ nguyên, không dựng bản nháp cạnh');
  assert.equal(a.children[0].characters, 'Sửa tay');
  assert.equal((await upd()).ok, true);
  assert.equal(frameOf(grp, 'g1-a').length, 1, 'Lượt lặp không nhân đôi');
}

// Khung bản cũ không có vân tay + node con lạ => không chứng minh được nguyên bản => giữ, không xoá.
async function testLegacyStrangeChild(bundle) {
  const page = mk('PAGE', 'Màn');
  const area = mk('SECTION', 'Sáng', { [AREA]: 'light' }, mk('SECTION', 'Hiện tại', {}, page));
  const grp = mk('SECTION', 'Nhóm 1', { groupId: 'g1' }, area);
  const strange = mk('FRAME', 'g1-a · light', { source: 'ai', status: 'draft', screenId: 'g1-a', theme: 'light' }, grp);
  mk('FRAME', 'Nút designer thêm', {}, strange);
  const plain = mk('FRAME', 'g1-b · light', { source: 'ai', status: 'draft', screenId: 'g1-b', theme: 'light' }, grp, { height: 300 });
  const env = boot(bundle, [page]);
  const r = await env.call('updateDraft', { screenIds: ['g1-a', 'g1-b'], themes: ['light'] });
  assert.equal(r.ok, true, r.error);
  const flow = flowOf(page);
  assert.ok(flow.children.includes(strange) && strange.getPluginData('source') === 'human', 'Bản cũ có node lạ phải được giữ (và chuyển vào luồng)');
  assert.ok(plain.removed, 'Bản cũ khớp tên/cỡ/node con thì được thay');
  assert.equal(r.value.editedKept, 1);
  assert.equal(frameOf(flow, 'g1-a').length, 2);
}

(async () => {
  const bundle = process.argv[2];
  await testContainer(bundle);
  await testSectionEmpty(bundle);
  await testSectionKeepsHuman(bundle);
  await testThemesAndGroupOrders(bundle);
  await testEditedContainer(bundle);
  await testEditedSection(bundle);
  await testLegacyStrangeChild(bundle);
  console.log('verify_cleanup.js: OK (dọn Cải tiến/Tối, giữ khung designer, ổn định, order từ plan)');
})().catch((e) => { console.error(e); process.exit(1); });

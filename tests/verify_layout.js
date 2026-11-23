// Kiểm cờ improved=false (chỉ có khu Hiện tại) và xếp hàng không đè trong cây Section khu → nhóm → luồng, trên bundle dựng từ tests/layout-extension
// với khung 100×100, perRow 3. Chạy: node verify_layout.js <code.js>  (verify_release.py dựng bundle rồi gọi).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { strictNode, markRemoved } = require('./strict-node.js');
const U = require('./tree-util.js');

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

function boot(bundlePath, pages) {
  const root = new MockNode('DOCUMENT');
  const list = pages && pages.length ? pages : [Object.assign(new MockNode('PAGE'), { name: 'Page 1' })];
  list.forEach((p) => root.appendChild(p));
  const msgs = [];
  const figma = {
    root, currentPage: list[0], ui: { onmessage: null, postMessage: (m) => msgs.push(m) }, showUI() {}, closePlugin() {},
    loadAllPagesAsync: async () => {}, setCurrentPageAsync: async (p) => { figma.currentPage = p; },
    getNodeByIdAsync: async () => null, loadFontAsync: async () => {}, commitUndo() {},
    createPage: () => { const p = new MockNode('PAGE'); root.appendChild(p); return p; },
    createFrame: () => new MockNode('FRAME'), createSection: () => new MockNode('SECTION'), createText: () => new MockNode('TEXT'),
    base64Decode: (x) => x,
  };
  const sb = { figma, __html__: '<html/>', console };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), sb);
  const call = async (name, args) => {
    msgs.length = 0;
    await figma.ui.onmessage({ type: 'PLUGIN_CMD', cmd: { id: 'c', name, args: args || {} } });
    return msgs.find((m) => m.type === 'PLUGIN_RESULT').result;
  };
  return { root, call };
}

const overlapNodes = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
function assertNoOverlap(nodes, what) {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) assert.ok(!overlapNodes(nodes[i], nodes[j]), `${what} đè nhau: ${nodes[i].name} / ${nodes[j].name}`);
  }
}
const LABEL_H = 88; // ST_GRID.labelH
const PAD = 60; // TREE.pad
const GAP_X = 56; // TREE.gapX
const { all, tag, frameOf, labelsOf, overlap, checkHug } = U;
const frames = (parent) => parent.children.filter((n) => n.type === 'FRAME');
// Không có screenFlows trong plan: mọi nhóm vào khu KHÁC, mọi màn vào luồng KHÁC.
const flowOf = (root, group) => all(root).find((n) => n.type === 'SECTION' && tag(n, 'treeLevel') === 'flow' && tag(n, 'treeKey').startsWith(group + '/'));
const pageRoot = (env) => env.root.children.find((p) => p.name === 'Tính năng');
const ALL = ['g1-a', 'g1-b', 'g1-c', 'g1-d', 'g1-e', 'g2-a', 'g2-b'];

async function testEmptyFile(bundle) {
  const env = boot(bundle);
  const first = await env.call('updateDraft', { screenIds: ALL, themes: ['light'] });
  assert.equal(first.ok, true, first.error);
  assert.equal(first.value.mode, 'tree');
  assert.equal(first.value.target, 'current');
  const page = pageRoot(env);
  assert.deepEqual(page.children.map((n) => [n.type, n.name]), [['SECTION', 'KHÁC']], 'File trống: chỉ có cây Section, không container, không Cải tiến');
  assert.ok(!env.root.children.some((p) => p.children.some((n) => n.name === 'Cải tiến')), 'Không được có khu Cải tiến');
  const g1 = flowOf(page, 'g1');
  const cell = (id) => frames(g1).find((f) => f.getPluginData('screenId') === id);
  assertNoOverlap(frames(g1), 'Ô lưới');
  // Hàng 1 = a,b,c (cao nhất 300); hàng 2 = d,e bắt đầu sau 300 + khoảng cách
  assert.equal(cell('g1-d').y, cell('g1-a').y + 300 + 96 + LABEL_H);
  assert.equal(cell('g1-e').x, cell('g1-a').x + 100 + GAP_X);
  const sg = (n) => U.named(U.named(page, 'KHÁC'), n);
  assert.ok(sg('Nhóm 2').y >= sg('Nhóm 1').y + sg('Nhóm 1').height, 'Nhóm sau phải nối tiếp bên dưới nhóm trước');
  checkHug(page, PAD);
  // Chỉ build lại nhóm 2: nhóm 1 giữ nguyên vị trí và nhãn
  const before = cell('g1-e').y;
  const again = await env.call('updateDraft', { screenIds: ['g2-b'], themes: ['light'] });
  assert.equal(again.ok, true, again.error);
  assert.equal(cell('g1-e').y, before);
  assert.deepEqual(U.levelOf(page, 'group').map((n) => n.name).sort(), ['Nhóm 1', 'Nhóm 2']);
  assertNoOverlap(frames(g1), 'Ô lưới sau build lại');
  const improved = await env.call('updateDraft', { target: 'improved' });
  assert.equal(improved.ok, false, 'Tắt Cải tiến thì target=improved phải bị từ chối');
  assert.equal((await env.call('buildImproved')).ok, false);
}

async function testOnlyCurrentSection(bundle) {
  const page = Object.assign(new MockNode('PAGE'), { name: '01 · Màn hình' });
  const cur = Object.assign(new MockNode('SECTION'), { name: 'Hiện tại' });
  const oldImp = Object.assign(new MockNode('SECTION'), { name: 'Cải tiến' });
  const keep = Object.assign(new MockNode('FRAME'), { name: 'Bản cũ' });
  oldImp.appendChild(keep);
  page.appendChild(cur);
  page.appendChild(oldImp);
  const env = boot(bundle, [page]);
  const res = await env.call('updateDraft', { screenIds: ['g1-a', 'g1-b', 'g1-c', 'g1-d', 'g1-e', 'g2-a'], themes: ['light', 'dark'] });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.value.mode, 'tree');
  assert.deepEqual(oldImp.children, [keep], 'Cải tiến cũ phải giữ nguyên, không ghi');
  assert.equal(oldImp.getPluginData('kind'), '');
  assert.equal(page.children.length, 2);
  assert.deepEqual(cur.children.map((n) => n.name), ['KHÁC'], 'Gốc là Section Hiện tại: chỉ 1 khu, không còn vùng Sáng/Tối');
  const [g1, g2] = ['Nhóm 1', 'Nhóm 2'].map((n) => U.named(cur.children[0], n));
  const flow = g1.children[0];
  const f = (id, theme) => frames(flow).find((x) => x.getPluginData('screenId') === id && x.getPluginData('theme') === theme);
  assertNoOverlap(frames(flow), 'Khung trong luồng (2 chủ đề)');
  assert.equal(f('g1-a', 'dark').x, f('g1-a', 'light').x + 100 + GAP_X, 'Hai chủ đề của một màn nằm cạnh nhau');
  assert.equal(f('g1-b', 'light').y, f('g1-a', 'light').y + 100 + 96 + LABEL_H, 'Mỗi màn 2 khung (2 chủ đề) chiếm 2/3 cột nên mỗi hàng một màn');
  assert.ok(g2.y >= g1.y + g1.height, 'Nhóm xếp dọc nối tiếp');
  checkHug(cur, PAD);
  const manual = Object.assign(new MockNode('FRAME'), { name: 'Vẽ tay', x: 60, y: 90 });
  flow.appendChild(manual);
  manual.setPluginData('source', 'human');
  const again = await env.call('updateDraft', { screenIds: ['g1-a', 'g1-b', 'g1-c'], themes: ['light'] });
  assert.equal(again.ok, true, again.error);
  assert.deepEqual([manual.x, manual.y], [60, 90], 'Khung vẽ tay (không có screenId) giữ nguyên chỗ');
  assertNoOverlap(frames(flow), 'Khung sau khi có khung vẽ tay');
}

async function testEmptySection(bundle) {
  const page = Object.assign(new MockNode('PAGE'), { name: 'Màn' });
  page.appendChild(Object.assign(new MockNode('SECTION'), { name: 'Hiện tại' }));
  const env = boot(bundle, [page]);
  const res = await env.call('updateDraft', { screenIds: ['g2-a'], themes: ['light'] });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.value.mode, 'tree');
}

const textsOf = (parent) => parent.children.filter((n) => n.type === 'TEXT' && n.getPluginData('role') === 'screenLabel');
const CODES = { 'g1-a': '1.01', 'g1-b': '1.02', 'g1-e': '1.05', 'g2-a': '2.01', 'g2-b': '2.02' };

// Nhãn đúng nội dung, nằm sát trên khung, không đè khung nào (kể cả hàng trên); tên layer = `<mã> · <title>`.
function assertLabels(parent, titles) {
  const fr = frames(parent).filter((f) => f.getPluginData('source') === 'ai');
  const lb = textsOf(parent);
  assert.equal(lb.length, fr.length * 2, 'Mỗi khung đúng 2 nhãn (tiêu đề + stem)');
  for (const f of fr) {
    const id = f.getPluginData('screenId');
    const mine = lb.filter((n) => n.getPluginData('labelFor') === f.id);
    const title = mine.find((n) => n.getPluginData('part') === 'title');
    const stem = mine.find((n) => n.getPluginData('part') === 'stem');
    assert.equal(title.characters, f.name);
    assert.equal(stem.characters, id);
    assert.equal(f.name, CODES[id] ? CODES[id] + ' · ' + titles[id] : f.name);
    assert.ok(title.y + title.height <= stem.y && stem.y + stem.height <= f.y, 'Nhãn nằm trên khung');
    assert.equal(title.x, f.x);
  }
  assertNoOverlap(fr.concat(lb), 'Khung/nhãn');
}

async function testLabelsPage(bundle) {
  const env = boot(bundle);
  const args = { screenIds: ALL, themes: ['light'] };
  assert.equal((await env.call('updateDraft', args)).ok, true);
  const cur = pageRoot(env);
  const titles = { 'g1-a': 'M a', 'g1-b': 'M b', 'g1-e': 'M e', 'g2-a': 'N a', 'g2-b': 'N b' };
  assertLabels(flowOf(cur, 'g1'), titles);
  assertLabels(flowOf(cur, 'g2'), titles);
  assert.equal(frameOf(cur, 'g1-a')[0].name, '1.01 · M a', 'Chỉ 1 chủ đề: bỏ hậu tố theme');
  const ids = () => all(cur).filter((n) => n.type === 'FRAME' && tag(n, 'source') === 'ai').map((f) => tag(f, 'screenId')).sort().join();
  const ref = ids();
  assert.equal((await env.call('updateDraft', args)).ok, true);
  assert.equal((await env.call('updateDraft', { screenIds: ['g2-b'], themes: ['light'] })).ok, true);
  assert.equal(ids(), ref, 'Cập nhật lại không nhân đôi khung');
  assertLabels(flowOf(cur, 'g1'), titles);
}

// Bố cục cũ (Hiện tại → Sáng → Nhóm 1) có khung dựng bằng plugin cũ: chuyển vào cây, nhận lại khung mất tag, không nhân đôi.
async function testLabelsLegacySection(bundle) {
  const page = Object.assign(new MockNode('PAGE'), { name: 'Màn' });
  const cur = Object.assign(new MockNode('SECTION'), { name: 'Hiện tại' });
  const area = Object.assign(new MockNode('SECTION'), { name: 'Sáng' });
  const grp = Object.assign(new MockNode('SECTION'), { name: 'Nhóm 1' });
  grp.setPluginData('groupId', 'g1');
  // Bản dựng bằng plugin cũ: g1-a mất tag (chỉ còn tên `screenId · light`), g1-b còn tag ai, g1-c do người vẽ.
  const legacy = Object.assign(new MockNode('FRAME'), { name: 'g1-a · light' });
  legacy.appendChild(new MockNode('TEXT'));
  const old = Object.assign(new MockNode('FRAME'), { name: 'g1-b · light', x: 500, height: 300 });
  old.appendChild(new MockNode('TEXT'));
  old.setPluginData('screenId', 'g1-b'); old.setPluginData('theme', 'light'); old.setPluginData('source', 'ai');
  const human = Object.assign(new MockNode('FRAME'), { name: 'Vẽ tay g1-c', x: 60, y: 90 });
  human.setPluginData('screenId', 'g1-c'); human.setPluginData('theme', 'light'); human.setPluginData('source', 'human');
  [legacy, old, human].forEach((n) => grp.appendChild(n));
  area.appendChild(grp); cur.appendChild(area); page.appendChild(cur);
  const env = boot(bundle, [page]);
  const args = { screenIds: ['g1-a', 'g1-b', 'g1-c', 'g1-d', 'g1-e'], themes: ['light'] };
  assert.equal((await env.call('updateDraft', args)).ok, true);
  assert.equal((await env.call('updateDraft', args)).ok, true);
  const flow = flowOf(cur, 'g1');
  const mine = (id) => frames(flow).filter((f) => f.getPluginData('screenId') === id);
  assert.equal(mine('g1-a').length, 1, 'Bản cũ mất tag được nhận và thay, không tạo bản trùng');
  assert.equal(mine('g1-b').length, 1, 'Bản cũ còn tag được thay');
  assert.ok(!flow.children.includes(legacy) && !flow.children.includes(old));
  assert.equal(mine('g1-a')[0].name, '1.01 · M a');
  assert.equal(mine('g1-c').length, 2, 'Khung vẽ tay giữ nguyên, bản nháp mới nằm cạnh');
  assert.ok(human.parent === flow && textsOf(flow).every((n) => n.getPluginData('labelFor') !== human.id), 'Khung vẽ tay không được gắn nhãn');
  const hi = mine('g1-c').indexOf(human);
  assert.ok(mine('g1-c')[1 - hi].x > human.x && mine('g1-c')[1 - hi].y === human.y, 'Bản sửa tay đứng trước, bản mới ngay cạnh trong cùng hàng');
  const ai = frames(flow).filter((f) => f !== human);
  assert.equal(textsOf(flow).length, ai.length * 2, 'Không nhân đôi nhãn sau 2 lượt Cập nhật');
  assert.ok(!cur.children.includes(area), 'Vùng Sáng cũ đã trống thì bị xoá');
  assertNoOverlap(frames(flow).concat(textsOf(flow)), 'Khung/nhãn trong luồng');
}

// Lượt Cập nhật lặp với lô khác nhau / trùng nhau trên file đã có khung bản cũ (không nhãn): node đã bị xoá
// trong cùng lượt (khung nháp + nhãn của nó) không được bị đọc tiếp. Figma giả ném lỗi như Figma thật.
async function testRepeatedBatches(bundle, sectionRoot) {
  const batches = [['g1-a', 'g1-b', 'g1-c'], ['g2-a', 'g2-b'], ['g1-a', 'g2-a'], ['g1-a', 'g1-b', 'g1-c', 'g1-d', 'g1-e', 'g2-a', 'g2-b'], ['g1-a', 'g2-a']];
  const page = Object.assign(new MockNode('PAGE'), { name: 'Màn' });
  const cur = sectionRoot ? Object.assign(new MockNode('SECTION'), { name: 'Hiện tại' }) : null;
  if (cur) page.appendChild(cur);
  const env = boot(bundle, [page]);
  const root = () => cur || pageRoot(env);
  for (const [i, ids] of batches.entries()) {
    const res = await env.call('updateDraft', { screenIds: ids, themes: ['light'] });
    assert.equal(res.ok, true, `Lượt ${i + 1}: ${res.error}`);
    if (i === 0) all(root()).filter((n) => n.type === 'TEXT' && tag(n, 'role') === 'screenLabel').forEach((n) => n.remove());
    checkHug(root(), PAD);
  }
  const ai = all(root()).filter((f) => f.type === 'FRAME' && tag(f, 'source') === 'ai');
  assert.equal(new Set(ai.map((f) => tag(f, 'screenId'))).size, ai.length, 'Lượt lặp không nhân đôi khung');
  for (const flow of U.levelOf(root(), 'flow')) {
    for (const f of frames(flow)) assert.ok([0, 2].includes(labelsOf(flow, f).length), 'Mỗi khung có 0 (bản cũ không nhãn) hoặc đúng 2 nhãn');
    assert.ok(textsOf(flow).every((t) => frames(flow).some((f) => f.id === t.getPluginData('labelFor'))), 'Không còn nhãn mồ côi');
  }
}

// Nhóm xếp theo `order` (menu) từ trên xuống, không đè, kể cả nhóm dựng ở lượt trước có tag cũ; Section nhóm đổi tên theo title mới.
async function testGroupOrder(bundle, sectionRoot) {
  const page = Object.assign(new MockNode('PAGE'), { name: 'Màn' });
  let cur = null;
  if (sectionRoot) { cur = Object.assign(new MockNode('SECTION'), { name: 'Hiện tại' }); page.appendChild(cur); }
  const env = boot(bundle, [page]);
  const root = () => cur || pageRoot(env);
  const upd = (ids) => env.call('updateDraft', { screenIds: ids, themes: ['light'] });
  assert.equal((await upd(['g2-a', 'g2-b'])).ok, true);
  assert.equal((await upd(['g1-a'])).ok, true);
  const area = root().children.find((n) => n.type === 'SECTION' && tag(n, 'treeLevel') === 'area');
  const seq = () => area.children.filter((n) => tag(n, 'treeKey')).sort((a, b) => a.y - b.y).map((n) => n.name);
  assert.deepEqual(seq(), ['Nhóm 1', 'Nhóm 2'], 'Nhóm order 1 phải nằm trên nhóm order 2 dù dựng sau');
  const g1 = U.named(area, 'Nhóm 1');
  g1.name = 'Tên cũ'; g1.setPluginData('treeOrder', '9');
  const f = frameOf(root(), 'g1-a')[0];
  f.setPluginData('groupOrder', '9'); f.setPluginData('groupTitle', 'Cũ');
  assert.equal((await upd(['g2-a'])).ok, true);
  assert.equal(g1.name, 'Nhóm 1', 'Tên Section nhóm cũ phải đổi sang title mới');
  assert.deepEqual([f.getPluginData('groupOrder'), f.getPluginData('groupTitle')], ['1', 'Nhóm 1'], 'Tag nhóm trên khung theo order/title mới');
  assert.deepEqual(seq(), ['Nhóm 1', 'Nhóm 2']);
  checkHug(root(), PAD);
}

(async () => {
  const bundle = process.argv[2];
  await testEmptyFile(bundle);
  await testOnlyCurrentSection(bundle);
  await testEmptySection(bundle);
  await testLabelsPage(bundle);
  await testLabelsLegacySection(bundle);
  await testRepeatedBatches(bundle, false);
  await testRepeatedBatches(bundle, true);
  await testGroupOrder(bundle, false);
  await testGroupOrder(bundle, true);
  console.log('verify_layout.js: OK (improved=false, cây Section, xếp hàng không đè)');
})().catch((e) => { console.error(e); process.exit(1); });

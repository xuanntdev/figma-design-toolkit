// Kiểm engine link (kit_core/plugin/core/07k..07o) bằng luật giả của tests/link-extension, chạy trên bundle verify_release dựng.
// Chạy: node verify_link.js merge <đủ luật + token> <chỉ token> <không khai gì>   (sync=merge, target=current: instance, token, vân tay, sửa tay)
//       node verify_link.js replace <đủ luật + token>                              (sync=replace, target=improved: dựng lại không nhân đôi)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { strictNode, markRemoved } = require('./tests/strict-node.js');

let seq = 1;
class MockNode {
  constructor(type) {
    Object.assign(this, { id: 'N' + seq++, type, name: type, children: [], parent: null, x: 0, y: 0, width: 100, height: 20, fills: [], strokes: [], _pd: {} });
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
  set characters(v) { this._chars = v; }
  get characters() { return this._chars; }
}
const install = require('./tests/figma-token-mock')(MockNode);

function boot(bundle) {
  const root = new MockNode('DOCUMENT');
  const page = new MockNode('PAGE');
  page.name = 'Page 1';
  root.appendChild(page);
  const msgs = [];
  const mk = (t) => () => new MockNode(t);
  const figma = {
    root, currentPage: page, ui: { onmessage: null, postMessage: (m) => msgs.push(m) }, showUI() {}, closePlugin() {},
    loadAllPagesAsync: async () => {}, setCurrentPageAsync: async (p) => { figma.currentPage = p; }, getNodeByIdAsync: async () => null,
    loadFontAsync: async () => {}, listAvailableFontsAsync: async () => [], commitUndo() {},
    createPage: () => { const p = new MockNode('PAGE'); root.appendChild(p); return p; },
    createFrame: mk('FRAME'), createSection: mk('SECTION'), createText: mk('TEXT'), createRectangle: mk('RECTANGLE'), base64Decode: (x) => x,
  };
  const registry = install(figma, root);
  const sb = { figma, __html__: '<html/>', console };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(bundle, 'utf8'), sb);
  const call = async (name, args) => {
    msgs.length = 0;
    await figma.ui.onmessage({ type: 'PLUGIN_CMD', cmd: { id: 'c', name, args: args || {} } });
    const r = msgs.find((m) => m.type === 'PLUGIN_RESULT').result;
    assert.equal(r.ok, true, r.error);
    return r.value;
  };
  return { root, call, registry, figma };
}

const all = (node) => node.children.flatMap((c) => [c, ...all(c)]);
const framesOf = (root, id) => all(root).filter((n) => n.type === 'FRAME' && n.getPluginData('screenId') === id);
const ARGS = { screenIds: ['g1-a', 'g1-b'], themes: ['light'], target: 'current' };
const byId = (reg) => { const m = {}; reg.sets.forEach((s) => { m[s.id] = s; s.children.forEach((c) => { m[c.id] = c; }); }); return m; };

function checkLinked(env, res) {
  const a = framesOf(env.root, 'g1-a')[0];
  const [save, cancel] = a.children.filter((n) => n.type === 'INSTANCE');
  const prim = env.registry.sets.find((s) => s.children.some((c) => c.name === 'Kind=primary'));
  assert.equal(save.mainId, prim.children.find((c) => c.name === 'Kind=primary').id, 'Variant primary');
  assert.equal(cancel.mainId, prim.children.find((c) => c.name === 'Kind=plain').id, 'Variant plain');
  assert.deepEqual([save.findOne((x) => x.name === 'Label').characters, cancel.findOne((x) => x.name === 'Label').characters], ['Lưu', 'Hủy'], 'Override Label');
  assert.deepEqual([save.name, save.x, save.width, save.height], ['Btn', 10, 80, 32], 'Vị trí + kích thước theo node nguồn');
  const link = res.link;
  assert.deepEqual(JSON.parse(JSON.stringify(link.byComp)), { btn: 2, card: 1, pair: 1 });
  const b = framesOf(env.root, 'g1-b')[0];
  assert.deepEqual([b.children.filter((n) => n.name === 'Pair').length, b.children.length], [1, 2], 'matchRun nuốt 2 node anh em thành 1 instance');
  assert.deepEqual(JSON.parse(JSON.stringify(link.missing)), { ghost: 1 }, 'Luật khớp nhưng thiếu component: fallback + thống kê');
  assert.equal(link.errors.boom, 1, 'Luật ném lỗi không làm hỏng lượt');
  assert.ok(link.linkedPct > 0 && link.linkedPct < 100, 'Có độ phủ một phần: ' + link.linkedPct);
  assert.ok(link.unmatchedTop.some((u) => u.label === 'box.ghost') && link.unmatchedTop.some((u) => u.label === 'box.boom'));
  return { a, save };
}

function checkTokens(env, a, res) {
  const red = env.registry.variables.find((v) => v.name === 'c/red');
  const box = a.children.find((n) => n.cornerRadius === 4);
  assert.equal(box.fills[0].boundVariables.color.id, red.id, 'Fill khớp hex gắn biến');
  assert.equal(box.boundVariables.topLeftRadius.id, env.registry.variables.find((v) => v.name === 'r/sm').id, 'Bo góc gắn biến Radius');
  const [hello, odd] = box.children;
  assert.equal(hello.fills[0].boundVariables.color.id, env.registry.variables.find((v) => v.name === 'c/black').id, 'Màu chữ gắn biến');
  assert.equal(hello.textStyleId, env.registry.styles[0].id, 'Chữ khớp gắn text style');
  assert.ok(!odd.fills[0].boundVariables && !odd.textStyleId, 'Không khớp: giữ giá trị thô');
  const t = res.link.tokens;
  assert.deepEqual([t.fill.bound, t.fill.total, t.text.bound, t.text.total, t.textStyle.bound, t.textStyle.total, t.radius.bound], [1, 1, 1, 2, 1, 2, 1], JSON.stringify(t));
}

// Sửa component + đổi giá trị biến: instance / biến đổi theo, khung KHÔNG bị coi là sửa tay; sửa Label tay thì bị coi là sửa tay.
async function checkMerge(env) {
  const reg = byId(env.registry);
  const prim = env.registry.sets.find((s) => s.children.some((c) => c.name === 'Kind=primary'));
  const comp = prim.children[0];
  comp.fills = [{ type: 'SOLID', color: { r: 0, g: 1, b: 0 } }];
  comp.resize(500, 50);
  const extra = new MockNode('TEXT');
  extra.name = 'Thêm';
  comp.appendChild(extra);
  prim.addComponentProperty('Show icon', 'BOOLEAN', false);
  all(env.root).filter((n) => n.type === 'FRAME').forEach((f) => f.syncInstances(reg));
  const again = await env.call('updateDraft', ARGS);
  assert.equal(again.editedKept, 0, 'Sửa component không được làm màn bị coi là sửa tay');
  assert.equal(again.merge.counts.skip, 2);
  const a = framesOf(env.root, 'g1-a')[0];
  const save = a.children.find((n) => n.type === 'INSTANCE');
  assert.ok(save.findAll((n) => n.name === 'Thêm').length === 1, 'Instance đổi theo component gốc');
  const box = a.children.find((n) => n.cornerRadius === 4);
  const redNow = env.registry.variables.find((v) => v.name === 'c/red');
  redNow.setValueForMode('m1', { r: 0, g: 0, b: 1, a: 1 });
  assert.equal(box.fills[0].boundVariables.color.id, redNow.id, 'Khối gắn đúng biến (không phải màu thô)');
  assert.deepEqual(JSON.parse(JSON.stringify(redNow.values.m1)), { r: 0, g: 0, b: 1, a: 1 }, 'Đổi giá trị biến: khối gắn biến đổi theo');
  save.setProperties({ [Object.keys(save.componentProperties).find((k) => k.startsWith('Label'))]: 'Đã sửa' });
  const edited = await env.call('updateDraft', ARGS);
  assert.equal(edited.editedKept, 1, 'Sửa property của instance bằng tay = sửa tay');
}

function checkNoLinkLeaks(env, res, label) {
  assert.equal(res.link, undefined, label + ': không có thống kê link');
  assert.ok(all(env.root).every((n) => n.type !== 'INSTANCE'), label + ': không có instance');
}

// Xem trước chỉ đọc: không dựng trang Token & Component (self-heal chỉ ở lượt Cập nhật).
async function checkPreviewReadOnly(bundle) {
  const env = boot(bundle);
  await env.call('previewSync', ARGS);
  assert.ok(!env.root.children.some((p) => p.name === 'Token & Component'), 'Xem trước không được dựng trang Token');
}

async function runMerge([full, tokensOnly, none]) {
  const env = boot(full);
  const res = await env.call('updateDraft', ARGS);
  const { a } = checkLinked(env, res);
  checkTokens(env, a, res);
  const second = await env.call('updateDraft', ARGS);
  assert.equal(second.merge.counts.skip, 2, 'Lượt 2 nguồn không đổi: bỏ qua hết');
  assert.equal(second.editedKept, 0);
  await checkMerge(env);
  const tk = boot(tokensOnly);
  const r = await tk.call('updateDraft', ARGS);
  assert.ok(all(tk.root).every((n) => n.type !== 'INSTANCE') && r.link.linked === 0, 'Chỉ token: không instance');
  assert.equal(r.link.tokens.fill.bound, 1, 'Chỉ token: khối thô vẫn gắn biến');
  const plain = boot(none);
  checkNoLinkLeaks(plain, await plain.call('updateDraft', ARGS), 'Không khai gì');
  assert.equal(framesOf(plain.root, 'g1-a')[0].children.length, 5, 'Không có luật: chỉ khối thô');
}

async function runReplace([full]) {
  const env = boot(full);
  const args = Object.assign({}, ARGS, { target: 'improved' });
  const res = await env.call('updateDraft', args);
  assert.deepEqual(JSON.parse(JSON.stringify(res.link.byComp)), { btn: 2, card: 1, pair: 1 });
  const again = await env.call('updateDraft', args);
  const drafts = framesOf(env.root, 'g1-a').filter((f) => f.getPluginData('source') === 'ai');
  assert.equal(drafts.length, 1, 'sync=replace: dựng lại không nhân đôi bản nháp');
  assert.equal(again.link.instances, 4);
  const a = drafts[0];
  assert.equal(a.children.filter((n) => n.type === 'INSTANCE').length, 2);
  await checkPreviewReadOnly(full);
}

async function main() {
  const [mode, ...bundles] = process.argv.slice(2);
  if (mode === 'merge') await runMerge(bundles);
  else await runReplace(bundles);
  console.log('verify_link.js ' + mode + ': OK');
}

main().catch((e) => { console.error(e); process.exit(1); });

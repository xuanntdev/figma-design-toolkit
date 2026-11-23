const assert = require('node:assert/strict');
const { MockNode, boot, all } = require('./link-env');

function add(parent, type, name, attrs = {}) {
  const node = Object.assign(new MockNode(type), { name }, attrs);
  parent.appendChild(node);
  return node;
}

function fixture(bundle) {
  const env = boot(bundle);
  const page = env.figma.currentPage;
  page.name = 'Checkout';
  const other = add(env.root, 'PAGE', 'Đã duyệt');
  for (const p of [page, other]) p.findAllWithCriteria = ({ types }) => p.findAll((n) => types.includes(n.type));
  const a = add(page, 'FRAME', 'Giỏ hàng', { layoutMode: 'VERTICAL', itemSpacing: 16 });
  const b = add(page, 'FRAME', 'Thanh toán');
  const c = add(other, 'FRAME', 'Xong');
  const text = (parent) => add(parent, 'TEXT', 'Nút', { characters: 'Tiếp tục', fontName: { family: 'Inter', style: 'Regular' } });
  const [x, y, z] = [a, b, c].map(text);
  env.figma.getNodeByIdAsync = async (id) => all(env.root).find((n) => n.id === id) || null;
  env.figma.createText = () => new MockNode('TEXT');
  const createText = env.figma.createText;
  env.figma.createText = () => Object.assign(createText(), { characters: '', fontName: x.fontName, fontSize: 12 });
  return { ...env, page, other, a, b, c, x, y, z };
}

const patch = (node, characters) => ({ nodeId: node.id, set: { characters } });

async function selectionAndSingle(env) {
  const { figma, page, other, a, b, x, z, call } = env;
  page.selection = [x];
  const selected = (await call('liveSelection')).selection;
  assert.equal(selected[0].frameId, a.id);
  assert.equal(selected[0].nodeId, x.id);
  assert.equal(selected[0].tree.chars, 'Tiếp tục');
  page.selection = [a, b];
  assert.equal((await call('liveSelection')).selection.length, 2);
  await figma.setCurrentPageAsync(other);
  assert.equal((await call('liveSelection')).selection.length, 0);
  await call('liveProtect', { pageId: other.id, blocked: true });
  await assert.rejects(() => call('liveEdit', { edits: [patch(z, 'Cấm')] }), /bị cấm ghi/);
  const value = await call('liveEdit', { edits: [patch(x, 'Xác nhận'), { nodeId: a.id, set: { itemSpacing: 24 } }] });
  assert.equal(value.changed, 2);
  assert.equal(x.characters, 'Xác nhận');
  assert.equal(a.itemSpacing, 24);
}

async function stagedEdits(env) {
  const { call, x, y, z, other } = env;
  const edits = [patch(x, 'Áp dụng'), patch(y, 'Áp dụng'), patch(z, 'Áp dụng')];
  await assert.rejects(() => call('liveEdit', { edits: edits.slice(0, 2) }), /sửa nhiều màn/);
  const stage = await call('liveStage', { jobId: 'preview', edits });
  assert.equal(stage.changes.length, 2);
  assert.equal(stage.blocked[0].pageId, other.id);
  assert.equal(y.characters, 'Tiếp tục');
  y.characters = 'BA đổi trước khi xác nhận';
  await assert.rejects(() => call('liveApply', { jobId: 'preview' }), /đã đổi/);
  assert.equal(x.characters, 'Xác nhận');
  await call('liveStage', { jobId: 'preview-2', edits });
  await call('liveApply', { jobId: 'preview-2' });
  await assert.rejects(() => call('liveApply', { jobId: 'preview-2' }), /đã đổi/);
  assert.deepEqual([x.characters, y.characters, z.characters], ['Áp dụng', 'Áp dụng', 'Tiếp tục']);
  await call('liveProtect', { pageId: other.id, blocked: false });
  await call('liveEdit', { edits: [patch(z, 'Gỡ cấm')] });
  assert.equal(z.characters, 'Gỡ cấm');
}

async function createAndRead(env) {
  const { page, other, a, c, call, figma } = env;
  const component = add(page, 'COMPONENT', 'Nút chính');
  const create = {
    parentId: page.id, name: 'Xác nhận đơn hàng',
    set: { size: { width: 390, height: 840 } },
    children: [{ type: 'INSTANCE', componentId: component.id }, { type: 'TEXT', set: { characters: 'Hoàn tất' } }],
  };
  await call('liveProtect', { pageId: other.id, blocked: true });
  await assert.rejects(() => call('liveCreate', { ...create, parentId: other.id }), /bị cấm ghi/);
  const result = await call('liveCreate', create);
  const screen = (await call('liveTree', { nodeId: result.nodeId })).node;
  assert.equal(screen.tree.n, create.name);
  assert.equal(screen.tree.c[0].t, 'INSTANCE');
  assert.equal(screen.tree.c[1].chars, 'Hoàn tất');
  const state = await call('readState');
  assert.ok(state.files['index.json'].screens.some((row) => row.id === result.nodeId));
  assert.ok(state.files['components.json'].components.some((row) => row.id === component.id && row.pageId === page.id));
  c.clone = () => add(page, 'FRAME', c.name);
  const cloned = await call('liveCreate', { parentId: a.id, cloneFrom: c.id, name: 'Bản tiếp theo' });
  assert.equal(cloned.frameId, cloned.nodeId);
  assert.ok((await call('readState')).files['index.json'].screens.some((row) => row.id === cloned.nodeId));
  assert.equal(c.parent, other, 'Không ghi vào màn nguồn ở page bị khóa');
  figma.createNodeFromSvg = () => new MockNode('FRAME');
  figma.createImage = () => ({ hash: 'asset-fixture' });
  const traced = await call('liveCreate', {
    parentId: page.id, name: 'Từ ảnh tham chiếu',
    children: [{ type: 'SVG', svg: '<svg></svg>' }, { type: 'IMAGE', base64: 'AAAA' }],
  });
  const canvas = (await call('liveTree', { nodeId: traced.nodeId })).node.tree;
  assert.equal(canvas.c.length, 2);
}

async function libraryImpact(env) {
  const { figma, a, b, c, call } = env;
  const collection = figma.variables.createVariableCollection('Design');
  const variable = figma.variables.createVariable('Space', collection, 'FLOAT');
  const modeId = collection.modes[0].modeId;
  variable.setValueForMode(modeId, 12);
  figma.variables.getVariableByIdAsync = async (id) => id === variable.id ? variable : null;
  for (const frame of [a, b, c]) frame.setBoundVariable('paddingTop', variable);
  const impact = await call('liveImpact', { variableId: variable.id });
  assert.equal(impact.inherited.length, 3);
  const edits = [{ variableId: variable.id, modeId, value: 16 }];
  await assert.rejects(() => call('liveEdit', { edits }), /sửa nhiều màn/);
  const preview = await call('liveStage', { jobId: 'token', edits });
  assert.ok(preview.changes.some((row) => row.frameId === c.id && row.inherited));
  assert.equal(preview.blocked.length, 0, 'Kế thừa từ biến không ghi trực tiếp vào page cấm');
  await call('liveApply', { jobId: 'token' });
  assert.equal(variable.valuesByMode[modeId], 16);
}

async function rollbackOnError(env) {
  const { a, x, call } = env;
  Object.defineProperty(a, 'itemSpacing', {
    configurable: true, get: () => 24,
    set: (value) => { if (value !== 24) throw new Error('Lỗi giữa lượt ghi'); },
  });
  const before = x.characters;
  await assert.rejects(() => call('liveEdit', {
    edits: [patch(x, 'Chữ trung gian'), { nodeId: a.id, set: { itemSpacing: 8 } }],
  }), /Lỗi giữa lượt ghi/);
  assert.equal(x.characters, before);
}

async function rebuildKeepsPrototype(env) {
  const { a, call } = env;
  const args = { screenIds: ['welcome'], themes: ['light'] };
  const first = await call('updateDraft', args);
  const destination = first.proposals[0].frameId;
  const button = add(a, 'RECTANGLE', 'Đi tới màn mẫu', {
    reactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: destination }] }],
  });
  button.setReactionsAsync = async (reactions) => { button.reactions = reactions; };
  const second = await call('updateDraft', args);
  assert.equal(second.prototype.links, 1);
  assert.equal(button.reactions[0].actions[0].destinationId, second.proposals[0].frameId);
}

async function main() {
  const env = fixture(process.argv[2]);
  if (process.argv.includes('--empty')) {
    const catalog = await env.call('getCatalog');
    assert.equal(catalog.hasBuilder, false);
    assert.equal(catalog.groups.length, 0);
    await selectionAndSingle(env);
    await stagedEdits(env);
    console.log('verify_live.js: popup không cần builder, đọc và sửa qua bridge vẫn hoạt động');
    return;
  }
  await selectionAndSingle(env);
  await stagedEdits(env);
  await createAndRead(env);
  await libraryImpact(env);
  await rollbackOnError(env);
  await rebuildKeepsPrototype(env);
  console.log('verify_live.js: selection, ghi trực tiếp, chặn page, lô sửa, tạo/clone, biến, khôi phục và prototype đạt');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

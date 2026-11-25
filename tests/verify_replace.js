// Kiểm thao tác replace (thay layer vẽ tay bằng instance) và trần lượt stage: instance đúng vị trí trong cha auto layout, giữ cách co giãn,
// đặt property, giữ tên, xoá layer cũ; từ chối layer nằm trong instance; stage nhận > 500 layer còn edit giữ trần 500.
// Chạy: node verify_replace.js <code.js>
const assert = require('node:assert/strict');
const path = require('node:path');
const { MockNode, boot } = require('./link-env.js');

MockNode.prototype.insertChild = function insertChild(index, child) {
  if (child.parent) child.parent.children = child.parent.children.filter((x) => x !== child);
  child.parent = this;
  this.children.splice(index, 0, child);
};

function node(type, props, parent) {
  const n = new MockNode(type);
  Object.assign(n, props || {});
  if (parent) parent.appendChild(n);
  return n;
}

function buttonComponent(env, page) {
  const comp = env.figma.createComponent();
  page.appendChild(comp);
  comp.name = 'Style=Primary';
  node('TEXT', { name: 'Label', characters: 'Nút' }, comp);
  const set = env.figma.combineAsVariants([comp], page);
  set.name = 'Button';
  const key = set.addComponentProperty('Label', 'TEXT', 'Nút');
  comp.children[0].componentPropertyReferences = { characters: key };
  return comp;
}

async function stageApply(env, edits, jobId) {
  const preview = await env.call('liveStage', { edits, jobId });
  return { preview, result: await env.call('liveApply', { jobId }) };
}

async function main(bundle) {
  const env = boot(path.resolve(bundle));
  const walk = (n) => [n, ...n.children.flatMap(walk)];
  env.figma.getNodeByIdAsync = async (id) => walk(env.root).find((n) => n.id === id && !n.removed) || null;
  const page = env.root.children[0];
  const comp = buttonComponent(env, page);
  const row = node('FRAME', { name: 'Hàng nút', layoutMode: 'HORIZONTAL' }, page);
  node('TEXT', { name: 'Trước', characters: 'a' }, row);
  const hand = node('FRAME', { name: 'Nút lưu vẽ tay', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', width: 120, height: 36 }, row);
  node('TEXT', { name: 'Chữ', characters: 'Lưu' }, hand);
  node('TEXT', { name: 'Sau', characters: 'b' }, row);

  const { preview } = await stageApply(env, [{ nodeId: hand.id, replace: { componentId: comp.id, properties: { Label: 'Lưu' } } }], 'r1');
  assert.ok(preview.changes.length === 1 && preview.changes[0].details[0].includes('replace'), JSON.stringify(preview));
  assert.ok(hand.removed, 'layer cũ phải bị xoá');
  const inst = row.children[1];
  assert.equal(inst.type, 'INSTANCE');
  assert.equal(inst.name, 'Nút lưu vẽ tay', 'giữ tên layer');
  assert.deepEqual(row.children.map((n) => n.name), ['Trước', 'Nút lưu vẽ tay', 'Sau'], 'đúng vị trí trong cha');
  assert.equal(inst.layoutSizingHorizontal, 'FILL');
  assert.equal(inst.height, 36, 'giữ chiều cao cố định');
  assert.equal(inst.findOne((n) => n.name === 'Label').characters, 'Lưu', 'đặt property chữ');

  const inner = inst.findOne((n) => n.name === 'Label');
  await assert.rejects(() => env.call('liveStage', { edits: [{ nodeId: inner.id, replace: { componentId: comp.id } }], jobId: 'r2' }), /Chỉ thay layer vẽ tay/);
  await assert.rejects(() => env.call('liveStage', { edits: [{ nodeId: row.id, replace: { componentId: comp.id }, set: { name: 'x' } }], jobId: 'r3' }), /replace hoặc set/);

  const many = Array.from({ length: 600 }, (_, i) => node('FRAME', { name: 'n' + i }, page));
  const edits = many.map((n, i) => ({ nodeId: n.id, set: { name: 'm' + i } }));
  await assert.rejects(() => env.call('liveEdit', { edits }), /1–500/, 'edit giữ trần 500');
  await stageApply(env, edits, 'r4');
  assert.ok(many.every((n, i) => n.name === 'm' + i), 'stage nhận 600 layer');
  console.log('verify_replace.js: OK · thay layer bằng instance đúng chỗ/co giãn/property, chặn trong instance, stage > 500 layer');
}

main(process.argv[2]).catch((e) => { console.error(e); process.exit(1); });

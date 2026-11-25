// Kiểm các lệnh đọc cho designer trên Figma giả: find (không dấu, phạm vi, trần + tổng, component), lint (màu thô, chữ chưa có style,
// detach, khung bọc thừa, bỏ ruột instance), thuộc tính dựng giao diện trong cây (fill/hug, căn trục, bóng, chữ, tên style),
// trần đọc tuỳ chọn (tree depth/maxNodes, readState depth). Thuần đọc.
// Chạy: node verify_designer.js <code.js>
const assert = require('node:assert/strict');
const path = require('node:path');
const { MockNode, boot } = require('./mock-env.js');

const plain = (v) => JSON.parse(JSON.stringify(v));
const kidsOf = (n) => n.children.flatMap((c) => [c, ...kidsOf(c)]);
const solid = (r, g, b) => ({ type: 'SOLID', color: { r, g, b } });

function node(type, props, parent) {
  const n = new MockNode(type);
  Object.assign(n, props || {});
  n.findAll = (fn) => kidsOf(n).filter(fn);
  if (parent) parent.appendChild(n);
  return n;
}

function screen(page) {
  const frame = node('FRAME', { name: 'Chi tiết', layoutMode: 'VERTICAL', itemSpacing: 16, primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER', fills: [solid(1, 1, 1)] }, page);
  const card = node('FRAME', { name: 'Card', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', fillStyleId: 'S:bg', cornerRadius: 12 }, frame);
  card.effects = [{ type: 'DROP_SHADOW', visible: true, radius: 32, spread: -4, offset: { x: 0, y: 12 }, color: { r: 0, g: 0, b: 0, a: 0.06 } }];
  card.fills = [solid(1, 1, 1)];
  node('TEXT', { name: 'Nhãn', characters: 'Số hợp đồng', fontName: { family: 'Inter', style: 'Medium' }, fontSize: 13, lineHeight: { unit: 'PIXELS', value: 20 }, fills: [solid(0.2, 0.2, 0.2)], textAlignHorizontal: 'CENTER' }, card);
  node('TEXT', { name: 'Có style', characters: 'Khảo sát', textStyleId: 'S:body', fills: [{ ...solid(0, 0, 0), boundVariables: { color: { id: 'V1' } } }] }, card);
  const wrap = node('FRAME', { name: 'Bọc', fills: [{ ...solid(1, 1, 1), opacity: 0 }] }, card);
  node('RECTANGLE', { name: 'Lõi', fills: [], strokes: [solid(1, 0, 0)], strokeWeight: 1 }, wrap);
  const icon = node('FRAME', { name: 'Khung icon', width: 20, height: 20 }, card);
  node('VECTOR', { name: 'Vector', width: 15, height: 15, fills: [] }, icon);
  node('FRAME', { name: 'Đã detach', detachedInfo: { type: 'local', componentId: 'C:1' }, fillStyleId: 'S:bg' }, card);
  const main = node('COMPONENT', { name: 'Nút Lưu' }, page);
  const inst = node('INSTANCE', { name: 'Lưu', componentProperties: {}, fills: [solid(0, 0.6, 0.4)] }, card);
  node('TEXT', { name: 'ruột', characters: 'Lưu', fills: [solid(1, 1, 1)] }, inst);
  inst.getMainComponentAsync = async () => main;
  return { frame, card, inst };
}

async function checkFind(env, s) {
  const hit = plain(await env.ok('liveFind', { query: 'so hop dong' }));
  assert.deepEqual(hit.hits.map((h) => h.n), ['Nhãn'], 'tìm không dấu theo nội dung chữ');
  assert.ok(hit.hits[0].text === 'Số hợp đồng' && hit.hits[0].path === 'Chi tiết / Card' && !('c' in hit.hits[0]), JSON.stringify(hit.hits[0]));
  const texts = plain(await env.ok('liveFind', { types: ['TEXT'], limit: 1, within: s.card.id }));
  assert.ok(texts.total === 3 && texts.shown === 1, 'trần kết quả nhưng báo đủ tổng: ' + JSON.stringify(texts));
  const comp = plain(await env.ok('liveFind', { component: 'nut luu' }));
  assert.deepEqual(comp.hits.map((h) => [h.n, h.component]), [['Lưu', 'Nút Lưu']]);
  assert.equal((await env.call('liveFind', {})).ok, false, 'thiếu điều kiện tìm phải báo lỗi');
}

async function checkLint(env, s) {
  const lint = plain(await env.ok('liveLint', { within: s.frame.id }));
  assert.deepEqual(lint.counts, { 'raw-fill': 2, 'raw-stroke': 1, 'no-text-style': 1, detached: 1, wrapper: 1 }, JSON.stringify(lint.counts));
  const ids = (rule) => lint.issues.filter((i) => i.rule === rule).map((i) => i.n);
  assert.deepEqual(ids('raw-fill').sort(), ['Chi tiết', 'Nhãn'], 'màu đã gắn style/biến và ruột instance không bị báo');
  assert.deepEqual(ids('wrapper'), ['Bọc'], 'khung icon khác kích thước con không phải khung thừa; fill trong suốt không tính màu thô');
  assert.deepEqual(ids('detached'), ['Đã detach']);
  assert.ok(lint.colors.some((c) => c.hex === '#ffffff'), JSON.stringify(lint.colors));
  const only = plain(await env.ok('liveLint', { within: s.frame.id, rules: ['wrapper'], limit: 5 }));
  assert.deepEqual(Object.keys(only.counts), ['wrapper']);
}

async function checkTree(env, s) {
  const tree = plain(await env.ok('liveTree', { nodeId: s.frame.id })).node.tree;
  assert.equal(tree.primaryAxisAlignItems, 'SPACE_BETWEEN');
  assert.equal(tree.counterAxisAlignItems, 'CENTER');
  const card = tree.c[0];
  assert.equal(card.layoutSizingHorizontal, 'FILL');
  assert.equal(card.layoutSizingVertical, 'HUG');
  assert.deepEqual(card.styles, { fill: 'Surface/Card' });
  assert.deepEqual(card.effects, [{ type: 'DROP_SHADOW', radius: 32, color: '#000000@0.06', offset: [0, 12], spread: -4 }]);
  const label = card.c.find((n) => n.n === 'Nhãn');
  assert.ok(label.lh === 20 && label.textAlignHorizontal === 'CENTER', JSON.stringify(label));
  assert.ok(!('layoutSizingHorizontal' in label) && !('opacity' in label), 'giá trị mặc định không ghi');
  const shallow = plain(await env.ok('liveTree', { nodeId: s.frame.id, depth: 1 })).node.tree;
  assert.ok(shallow.c[0].truncated, 'depth do người gọi đặt');
  const few = plain(await env.ok('liveTree', { nodeId: s.frame.id, maxNodes: 2, depth: 30 })).node.tree;
  assert.ok(JSON.stringify(few).includes('truncated'), 'maxNodes do người gọi đặt');
}

async function main(bundleArg) {
  const env = boot(path.resolve(bundleArg));
  env.figma.getLocalPaintStylesAsync = async () => [{ id: 'S:bg', name: 'Surface/Card' }];
  const page = env.root.children[0];
  page.findAll = (fn) => kidsOf(page).filter(fn);
  const s = screen(page);
  await checkFind(env, s);
  await checkLint(env, s);
  await checkTree(env, s);
  let cur = s.frame;
  for (let i = 0; i < 20; i++) cur = node('FRAME', { name: 'sâu' + i }, cur);
  const deep = (await env.ok('readState', {})).files;
  const deeper = (await env.ok('readState', { depth: 40 })).files;
  const has = (files) => JSON.stringify(files).includes('"sâu19"');
  assert.ok(!has(deep) && has(deeper), 'pull mặc định giữ trần 16 cấp, depth lớn hơn đọc tới đáy');
  console.log('verify_designer.js: OK · find, lint, thuộc tính dựng giao diện, trần đọc tuỳ chọn');
}

main(process.argv[2]).catch((e) => { console.error(e); process.exit(1); });

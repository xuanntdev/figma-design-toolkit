// Hai kịch bản dùng kit, và cách kết hợp hai khu, trên Figma giả nghiêm ngặt (bundle dựng từ tests/layout-extension):
//  A "sửa trực tiếp": target=current, layout=sections, sync=merge, preview=true (Hiện tại là cây Section, giữ bản designer sửa tay);
//  B "sinh màn mới": target=improved, improved=true, layout=grid, sync=replace (bản đề xuất vào Cải tiến, Hiện tại chỉ đọc);
//  AB: layout=sections + sync=merge cho khu Hiện tại và Cải tiến cạnh nhau; GB: layout=grid + sync=replace, đổi target giữa hai khu.
// Chạy: node verify_scenarios.js <thư mục chứa A/ B/ AB/ GB/ mỗi cái có code.js>  (verify_release.py dựng).
const assert = require('node:assert/strict');
const { boot, all, tag, page, aiFrames, sections, MockNode } = require('./tests/mock-env.js');

const COUNT = 7; // g1-a..e + g2-a..b (plan chỉ chọn 2 nhóm đầu)
const frameOf = (env, stem) => all(page(env, 'Tính năng')).filter((f) => f.type === 'FRAME' && ['ai', 'human'].includes(tag(f, 'source')) && tag(f, 'screenId') === stem);
const labelNodes = (root) => all(root).filter((n) => n.type === 'TEXT' && tag(n, 'role') === 'screenLabel');
const container = (env, kind) => page(env, 'Tính năng').children.find((n) => n.type === 'FRAME' && tag(n, 'role') === 'container' && tag(n, 'kind') === kind);

async function scenarioA(dir) {
  const env = boot(dir + '/A/code.js');
  const cat = await env.ok('getCatalog');
  assert.deepEqual(JSON.parse(JSON.stringify(cat.settings)), { layout: 'sections', sync: 'merge', preview: true, tokens: 'off' });
  const first = await env.ok('updateDraft', {});
  assert.equal(first.mode, 'tree');
  assert.equal(first.target, 'current');
  assert.equal(first.builtCount, COUNT);
  const pg = page(env, 'Tính năng');
  assert.deepEqual(pg.children.map((n) => [n.type, n.name]), [['SECTION', 'KHU A']], 'Chỉ có cây Section, không container, không Cải tiến');
  assert.deepEqual(sections(pg, 'group').map((n) => n.name).sort(), ['Nhóm 1', 'Nhóm 2']);
  assert.deepEqual(sections(pg, 'flow').map((n) => n.name).sort(), ['LUỒNG HAI', 'LUỒNG MỘT'], 'Nhóm 2 chỉ một luồng nên cấp luồng gộp vào nhóm');
  assert.equal(frameOf(env, 'g2-a')[0].parent.name, 'Nhóm 2');
  assert.equal(frameOf(env, 'g1-a')[0].name, '1.01 · M a', 'screenLabels=name: tên layer có mã');
  assert.equal(labelNodes(pg).length, 0, 'screenLabels=name không có nhãn chữ');
  assert.ok(!env.root.children.some((p) => all(p).some((n) => n.name === 'Cải tiến')), 'improved=false: không có khu Cải tiến');

  const edited = frameOf(env, 'g1-a')[0];
  all(edited).find((n) => n.type === 'TEXT').characters = 'Designer sửa';
  const preview = await env.ok('previewSync', {});
  assert.equal(preview.summary.counts.keepEdit, 1);
  assert.equal(preview.summary.counts.skip, COUNT - 1);
  const second = await env.ok('updateDraft', {});
  assert.equal(second.builtCount, 0, 'merge: không đổi nguồn thì không dựng lại, giữ bản sửa tay');
  assert.equal(second.merge.counts.keepEdit, 1);
  assert.equal(frameOf(env, 'g1-a').length, 1);
  assert.equal(tag(edited, 'source'), 'human');
  assert.equal((await env.ok('exportEdits', {})).count, 1);
  assert.equal((await env.call('updateDraft', { target: 'improved' })).ok, false, 'improved=false: target=improved bị từ chối');
}

// Ảnh chụp "Hiện tại" (ô role=cell, source=current) đặt sẵn trong container.
function snapshot(parent, tags) {
  const f = new MockNode('FRAME');
  parent.appendChild(f);
  Object.entries({ role: 'cell', source: 'current', ...tags }).forEach(([k, v]) => f.setPluginData(k, v));
  return f;
}

async function scenarioB(dir) {
  const env = boot(dir + '/B/code.js');
  const cat = await env.ok('getCatalog');
  assert.deepEqual(JSON.parse(JSON.stringify(cat.settings)), { layout: 'grid', sync: 'replace', preview: false, tokens: 'off' });
  const first = await env.ok('updateDraft', {});
  assert.equal(first.mode, 'container');
  assert.equal(first.target, 'improved');
  const cur = container(env, 'current');
  const imp = container(env, 'improved');
  assert.ok(cur && imp, 'Có đủ hai khung Hiện tại và Cải tiến');
  assert.equal(aiFrames(imp).length, COUNT);
  assert.equal(aiFrames(cur).length, 0, 'Hiện tại chỉ đọc làm gương, không ghi');
  assert.equal(sections(page(env, 'Tính năng'), 'group').length, 0, 'layout=grid: không có cây Section');
  assert.equal(labelNodes(imp).length, 0, 'screenLabels=false (mặc định): không nhãn chữ');
  assert.equal(frameOf(env, 'g1-a')[0].name, 'M a', 'screenLabels=false: giữ tên do extension đặt');

  const shot = snapshot(cur, { status: 'current', screenId: 'g1-a', theme: 'light', hash: 'h1' });
  const stale = snapshot(cur, { screenId: 'g1-b', theme: 'dark' });

  const mine = frameOf(env, 'g1-a')[0];
  all(mine).find((n) => n.type === 'TEXT').characters = 'Sửa tay mà không đổi tag';
  const chosen = frameOf(env, 'g1-b')[0];
  chosen.setPluginData('status', 'chosen');
  const preview = await env.ok('previewSync', {});
  assert.deepEqual([preview.summary.counts.replace, preview.summary.counts.create], [COUNT - 1, 1], 'replace: ô có bản nháp đều được thay (kể cả bản sửa tay, không so vân tay); ô chỉ còn bản đã chọn thì dựng thêm');
  const second = await env.ok('updateDraft', {});
  assert.equal(second.builtCount, COUNT, 'replace: dựng lại tất cả, không bỏ qua');
  assert.equal(second.keptProtected, 1, 'Chỉ bản đã chọn được giữ');
  assert.equal(second.editedKept, 0);
  assert.equal(await env.figma.getNodeByIdAsync(mine.id), null, 'Bản sửa tay mà không đổi tag bị thay (kit gốc)');
  assert.ok(await env.figma.getNodeByIdAsync(chosen.id), 'Bản status=chosen được giữ');
  assert.equal(frameOf(env, 'g1-b').length, 2, 'Bản mới nằm cạnh bản đã chọn');
  assert.equal(second.cleanup.removed.length, 0, 'cleanup=false: không dọn gì');
  assert.deepEqual([shot.parent, tag(shot, 'hash'), stale.parent], [cur, 'h1', cur], 'Ảnh chụp trong Hiện tại giữ nguyên, kể cả ô chủ đề ngoài plan');
  assert.equal(tag(imp, 'kind'), 'improved');
  assert.equal((await env.call('exportEdits', {})).ok, true);
}

async function scenarioAB(dir) {
  const env = boot(dir + '/AB/code.js');
  const a = await env.ok('updateDraft', { target: 'current' });
  assert.equal(a.mode, 'tree');
  const treeIds = aiFrames(page(env, 'Tính năng')).map((f) => f.id).sort();
  const b = await env.ok('updateDraft', { target: 'improved' });
  assert.equal(b.mode, 'container', 'Cải tiến luôn là lưới (container)');
  const pg = page(env, 'Tính năng');
  assert.equal(container(env, 'current'), undefined, 'layout=sections: không tạo khung Hiện tại, cây Section chính là Hiện tại');
  const imp = container(env, 'improved');
  assert.equal(aiFrames(imp).length, COUNT);
  assert.deepEqual(aiFrames(pg).filter((f) => f.parent !== imp).map((f) => f.id).sort(), treeIds, 'Khung trong cây Hiện tại không đổi sau khi dựng Cải tiến');
  assert.ok(!all(imp).some((n) => n.type === 'SECTION'));
  assert.ok(imp.x >= Math.max(...pg.children.filter((n) => n.type === 'SECTION').map((n) => n.x + n.width)), 'Cải tiến nằm bên phải cây Hiện tại');
  const again = await env.ok('updateDraft', { target: 'current' });
  assert.equal(again.builtCount, 0);
  assert.equal(aiFrames(imp).length, COUNT);
  const impAgain = await env.ok('updateDraft', { target: 'improved' });
  assert.equal(impAgain.builtCount, 0, 'merge: Cải tiến cũng bỏ qua khi nguồn không đổi');
}

async function scenarioGB(dir) {
  const env = boot(dir + '/GB/code.js');
  const cur = await env.ok('updateDraft', { target: 'current' });
  assert.equal(cur.mode, 'container');
  const imp = await env.ok('updateDraft', { target: 'improved' });
  assert.equal(imp.mode, 'container');
  const c = container(env, 'current');
  const i = container(env, 'improved');
  assert.deepEqual([aiFrames(c).length, aiFrames(i).length], [COUNT, COUNT]);
  assert.ok(aiFrames(c).every((f) => tag(f, 'role') === 'cell'), 'Khung dựng vào Hiện tại là ô (role=cell) như kit gốc');
  assert.ok(aiFrames(i).every((f) => tag(f, 'role') !== 'cell'));
  const before = aiFrames(i).map((f) => f.id).sort();
  await env.ok('updateDraft', { target: 'current' });
  assert.deepEqual(aiFrames(i).map((f) => f.id).sort(), before, 'Dựng lại Hiện tại không đụng Cải tiến');
  assert.ok(c.x < i.x, 'Hiện tại bên trái, Cải tiến bên phải');
}

(async () => {
  const dir = process.argv[2];
  await scenarioA(dir);
  await scenarioB(dir);
  await scenarioAB(dir);
  await scenarioGB(dir);
  console.log('verify_scenarios.js: OK (A sửa trực tiếp, B sinh màn mới, kết hợp hai khu cả cây Section lẫn lưới)');
})().catch((e) => { console.error(e); process.exit(1); });

// Từng tuỳ chọn của cây Section và bố cục (Figma giả nghiêm ngặt, bundle dựng từ tests/layout-extension): sectionLevels, collapseSingleFlow,
// sectionFills, sortGroups. Plan: nhóm 1 có 2 luồng, nhóm 2 một luồng, nhóm 3 ngoài lô. Chạy: node verify_options.js <thư mục bundle>.
const assert = require('node:assert/strict');
const { boot, all, tag, page, aiFrames, sections } = require('./mock-env.js');
const U = require('./tree-util.js');

const names = (list) => list.map((n) => n.name).sort();
const parentsOf = (pg, stem) => aiFrames(pg).filter((f) => tag(f, 'screenId') === stem).map((f) => f.parent);
const fillHex = (n) => (n.fills.length ? ['r', 'g', 'b'].map((k) => Math.round(n.fills[0].color[k] * 255).toString(16).padStart(2, '0')).join('') : null);

async function run(dir, name, args) {
  const env = boot(`${dir}/${name}/code.js`);
  await env.ok('updateDraft', args || {});
  const again = await env.ok('updateDraft', args || {});
  assert.equal(again.builtCount, 0, name + ': chạy lại không dựng lại');
  const pg = page(env, 'Tính năng');
  U.checkHug(pg, 60);
  assert.equal(aiFrames(pg).length, 7, name + ': đủ 7 khung, không nhân đôi');
  return pg;
}

async function levels(dir) {
  let pg = await run(dir, 'default');
  assert.deepEqual(pg.children.map((n) => n.name), ['KHU A']);
  assert.deepEqual([fillHex(sections(pg, 'area')[0]), fillHex(sections(pg, 'group')[0]), fillHex(sections(pg, 'flow')[0])], [null, 'dceafb', 'eef5fe'], 'màu mặc định: khu trong suốt');
  assert.deepEqual(names(sections(pg, 'flow')), ['LUỒNG HAI', 'LUỒNG MỘT'], 'collapseSingleFlow mặc định true');
  assert.equal(parentsOf(pg, 'g2-a')[0].name, 'Nhóm 2');

  pg = await run(dir, 'group-flow');
  assert.deepEqual(names(pg.children), ['Nhóm 1', 'Nhóm 2'], 'sectionLevels [group, flow]: không có cấp khu');
  assert.equal(sections(pg, 'area').length, 0);
  assert.deepEqual(names(sections(pg, 'flow')), ['LUỒNG HAI', 'LUỒNG MỘT', 'LUỒNG X'], 'collapseSingleFlow=false: nhóm một luồng vẫn có cấp luồng');
  assert.equal(parentsOf(pg, 'g2-a')[0].name, 'LUỒNG X');

  pg = await run(dir, 'group-flow-collapse');
  assert.deepEqual(names(sections(pg, 'flow')), ['LUỒNG HAI', 'LUỒNG MỘT'], 'Nhóm 2 chỉ một luồng: khung nằm thẳng trong nhóm');
  assert.deepEqual(parentsOf(pg, 'g2-b').map((n) => n.name), ['Nhóm 2']);
  assert.deepEqual(parentsOf(pg, 'g1-d').map((n) => n.name), ['LUỒNG HAI']);

  pg = await run(dir, 'group');
  assert.deepEqual(names(pg.children), ['Nhóm 1', 'Nhóm 2']);
  assert.deepEqual([sections(pg, 'flow').length, sections(pg, 'area').length], [0, 0], 'sectionLevels [group]: khung nằm thẳng trong nhóm');
  assert.deepEqual(new Set(aiFrames(pg).map((f) => f.parent.getPluginData('treeLevel'))), new Set(['group']));

  pg = await run(dir, 'area-flow');
  assert.deepEqual(pg.children.map((n) => n.name), ['KHU A']);
  assert.equal(sections(pg, 'group').length, 0, 'sectionLevels [area, flow]: không có cấp nhóm');
  assert.deepEqual(names(sections(pg, 'flow')), ['LUỒNG HAI', 'LUỒNG MỘT', 'LUỒNG X'], 'Không có cấp nhóm thì không gộp luồng');
}

async function fills(dir) {
  const pg = await run(dir, 'fills');
  assert.deepEqual([fillHex(sections(pg, 'area')[0]), fillHex(sections(pg, 'group')[0]), fillHex(sections(pg, 'flow')[0])], ['eeeeee', null, 'ffffff'], 'sectionFills đổi từng cấp, null = trong suốt');
}

// Nhóm khai báo order 3,1,2: sortGroups=true xếp 2 · 3 · 1 theo order, mặc định giữ thứ tự khai báo 1 · 2 · 3.
async function sorting(dir) {
  const rows = {};
  for (const name of ['sort-off', 'sort-on']) {
    const env = boot(`${dir}/${name}/code.js`);
    await env.ok('updateDraft', { screenIds: ['g1-a', 'g2-a', 'g3-a'], themes: ['light'] });
    const container = page(env, 'Tính năng').children.find((n) => tag(n, 'kind') === 'improved');
    const labels = all(container).filter((n) => n.type === 'TEXT' && tag(n, 'role') === 'label' && /^Nhóm/.test(n.characters));
    rows[name] = labels.sort((a, b) => a.y - b.y).map((n) => n.characters);
  }
  assert.deepEqual(rows['sort-off'], ['Nhóm 1', 'Nhóm 2', 'Nhóm 3']);
  assert.deepEqual(rows['sort-on'], ['Nhóm 2', 'Nhóm 3', 'Nhóm 1']);
}

(async () => {
  const dir = process.argv[2];
  await levels(dir);
  await fills(dir);
  await sorting(dir);
  console.log('verify_options.js: OK (sectionLevels, collapseSingleFlow, sectionFills, sortGroups)');
})().catch((e) => { console.error(e); process.exit(1); });

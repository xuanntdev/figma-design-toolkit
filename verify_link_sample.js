// Kiểm ví dụ engine link (capture/link-example) trên snapshot thật của capture/sample-site (tests/link-sample): màn dựng bằng instance Button / Tag /
// App/Header + biến token, thống kê độ phủ ở result.link, chạy lại ổn định, token không phủ hết thì lộ ở result.link.tokenMiss.
// Chạy: node verify_link_sample.js example <code.js dựng từ capture/extension + capture/link-example + tests/link-sample>
//       node verify_link_sample.js bare <code.js dựng từ capture/extension + tests/link-sample>   (không khai luật: dựng như cũ, không instance)
const assert = require('node:assert/strict');
const { boot, all, framesOf } = require('./tests/link-env.js');

const ARGS = { screenIds: ['sample-danh-sach', 'sample-chi-tiet'], themes: ['light'], target: 'current' };
const plain = (v) => JSON.parse(JSON.stringify(v));

function checkInstances(env, link) {
  assert.deepEqual(plain(link.byComp), { 'app-header': 2, button: 3, tag: 4 }, 'Số instance theo component');
  assert.equal(link.components, 3, 'Trang Token tự dựng đủ 3 component (self-heal)');
  assert.deepEqual(plain(link.missing), {}, 'Không thiếu component');
  const list = framesOf(env.root, 'sample-danh-sach')[0];
  const insts = all(list).filter((n) => n.type === 'INSTANCE');
  assert.deepEqual(insts.map((n) => n.name), ['App/Header', 'Tag', 'Tag', 'Button']);
  const header = insts[0];
  assert.deepEqual(['Title', 'Link1', 'Link2'].map((k) => header.findOne((n) => n.name === k).characters), ['Trang mẫu', 'Đơn hàng', 'Báo cáo']);
  assert.deepEqual(insts.slice(1, 3).map((n) => n.findOne((x) => x.name === 'Label').characters), ['Mới', 'Đang xử lý']);
  assert.equal(insts[3].findOne((x) => x.name === 'Label').characters, 'Xem chi tiết');
}

function checkTokens(env, link) {
  const card = all(env.root).find((n) => n.type === 'FRAME' && n.name === 'section.card');
  const surface = env.registry.variables.find((v) => v.name === 'color/bg/surface');
  assert.equal(card.fills[0].boundVariables.color.id, surface.id, 'Nền card gắn biến');
  assert.equal(card.boundVariables.topLeftRadius.id, env.registry.variables.find((v) => v.name === 'radius/lg').id, 'Bo góc card gắn biến');
  assert.equal(card.strokes[0].boundVariables.color.id, env.registry.variables.find((v) => v.name === 'color/border/default').id, 'Viền card gắn biến');
  const h1 = all(env.root).find((n) => n.type === 'TEXT' && n.characters === 'Danh sách đơn hàng');
  assert.equal(h1.textStyleId, env.registry.styles.find((s) => s.name === 'Heading/H1').id, 'Chữ khớp gắn text style');
  assert.ok(link.tokens.fill.pct >= 80 && link.tokens.text.pct >= 80, 'Độ phủ token: ' + JSON.stringify(link.tokens));
  assert.ok(link.linkedPct > 20, 'Độ phủ instance: ' + link.linkedPct);
}

// Extension snapshot không nạp ví dụ link: khối thô như trước khi có engine, không thống kê, không dựng component / biến.
async function checkBare(file) {
  const env = boot(file);
  const res = await env.call('updateDraft', ARGS);
  assert.equal(res.link, undefined, 'Không khai luật / token: không có result.link');
  assert.ok(all(env.root).every((n) => n.type !== 'INSTANCE'), 'Không có instance');
  assert.ok(!env.registry.sets.length && !env.registry.variables.length, 'Không tự dựng component / biến');
  const list = framesOf(env.root, 'sample-danh-sach').find((f) => f.getPluginData('source') === 'ai');
  assert.ok(all(list).some((n) => n.name === 'span.tag') && all(list).some((n) => n.name === 'button'), 'Tag / nút dựng thành khối thô');
}

async function checkExample(file) {
  const env = boot(file);
  const res = await env.call('updateDraft', ARGS);
  checkInstances(env, res.link);
  checkTokens(env, res.link);
  assert.ok(res.link.unmatchedTop.some((u) => u.label === 'section.card'), 'Phần tử chưa có luật hiện ở unmatchedTop');
  const again = await env.call('updateDraft', ARGS);
  assert.equal(again.link.instances, 9, 'Chạy lại cho cùng kết quả');
  assert.equal(framesOf(env.root, 'sample-danh-sach').length, 2, 'Khung Hiện tại + một bản nháp, không nhân đôi');
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  await (mode === 'bare' ? checkBare(file) : checkExample(file));
  console.log('verify_link_sample.js ' + mode + ': OK');
}

main().catch((e) => { console.error(e); process.exit(1); });

// Kiểm callMain trong ui.html: lệnh quá hạn bị nhả (báo lỗi, inflight về 0, kết quả đến muộn bị bỏ) để cửa sổ không kẹt; lệnh đúng hạn vẫn trả kết quả.
// Chạy: node verify_ui_timeout.js <thư mục bundle chứa ui.html>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function main(dir) {
  const html = fs.readFileSync(path.join(dir, 'ui.html'), 'utf8');
  const fn = html.match(/ {4}function callMain\(name, args, timeoutMs\) \{[\s\S]*?\n {4}\}\n/);
  assert.ok(fn, 'ui.html phải có callMain(name, args, timeoutMs)');
  const sent = [];
  const ctx = { seq: 0, inflight: 0, waiters: {}, setTimeout, clearTimeout, Promise, Error, Math, parent: { postMessage: (m) => sent.push(m.pluginMessage.cmd) } };
  vm.createContext(ctx);
  vm.runInContext('var seq = 0, inflight = 0, waiters = {};\n' + fn[0] + '\nthis.callMain = callMain; this.state = () => ({ inflight, waiting: Object.keys(waiters).length });', ctx);
  const hung = ctx.callMain('exportPng', {}, 30);
  await assert.rejects(hung, /không trả lời lệnh exportPng/);
  assert.deepEqual({ ...ctx.state() }, { inflight: 0, waiting: 0 }, 'lệnh quá hạn phải được nhả');
  const ok = ctx.callMain('liveSelection', {}, 1000);
  const cmd = sent[1];
  vm.runInContext(`waiters[${JSON.stringify(cmd.id)}]({ ok: true, value: 42 })`, ctx);
  assert.equal(await ok, 42);
  assert.equal(ctx.state().inflight, 0);
  console.log('verify_ui_timeout.js: OK · lệnh treo được nhả, lệnh đúng hạn vẫn trả kết quả');
}

main(process.argv[2]).catch((e) => { console.error(e); process.exit(1); });

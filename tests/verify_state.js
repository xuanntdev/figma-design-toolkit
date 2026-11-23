// Kiểm lệnh readState (chiều Figma -> repo) trên bundle đã dựng bằng Figma giả nghiêm ngặt: thuần đọc, trạng thái màn
// (untouched / edited / handmade), token + component, chạy lại ổn định, an toàn khi node bị xoá.
// Chạy: node verify_state.js <code.js>   (bundle dựng từ tests/link-extension, có component + token; verify_release dựng sẵn)
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { MockNode, boot } = require('./link-env.js');

const ARGS = { screenIds: ['g1-a', 'g1-b'], themes: ['light'], target: 'current' };
const all = (node) => node.children.flatMap((c) => [c, ...all(c)]);
const screenFrames = (env) => all(env.root).filter((n) => n.type === 'FRAME' && n.getPluginData('screenId'));

// Dấu vết toàn bộ cây (loại, tên, hình học, plugin data, chữ, property, fill) dạng hash để chứng minh readState không ghi gì (cây dự án rất lớn).
function snapshot(node, hash) {
  const top = !hash;
  const h = hash || crypto.createHash('sha1');
  h.update(JSON.stringify([node.id, node.type, node.name, node.x, node.y, node.width, node.height, node._pd, node._chars, node.componentProperties, node.fills, node.children.length]));
  node.children.forEach((c) => snapshot(c, h));
  return top ? h.digest('hex') : null;
}

const digest = (payload) => crypto.createHash('sha1').update(JSON.stringify(payload, (k, v) => (k === 'readAt' ? undefined : v))).digest('hex');

async function read(env, args) {
  return env.call('readState', args || {}); // env.call tự assert ok
}

function rowsOf(payload) {
  return payload.files['index.json'].screens;
}

function checkShape(payload, frames, requestId) {
  assert.equal(payload.kind, 'figma-state');
  assert.equal(payload.version, 1);
  assert.equal(payload.requestId, requestId || null);
  const files = payload.files;
  for (const k of ['index.json', 'tokens.json', 'components.json']) assert.ok(files[k], 'thiếu ' + k);
  assert.ok(Object.keys(files).every((k) => /^(index|tokens|components)\.json$|^screens\/[A-Za-z0-9._-]+\.json$/.test(k)), 'tên tệp lạ: ' + Object.keys(files));
  const rows = rowsOf(payload);
  assert.equal(rows.filter((r) => r.screenId).length, frames.length, 'số khung màn trong index');
  for (const r of rows) {
    assert.ok(files[r.file] && files[r.file].tree && files[r.file].tree.t === 'FRAME', 'thiếu cây của ' + r.key);
    assert.equal(r.file, 'screens/' + r.key + '.json');
  }
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length, 'khoá màn trùng');
  assert.ok(files['index.json'].readAt && files['index.json'].legend);
}

// Sửa tay: đổi chữ của một node thô trong màn đầu tiên (ngoài instance) và đổi variant của một instance nếu tìm được.
function editFrame(frame) {
  const raw = (n) => n.children.filter((c) => c.type !== 'INSTANCE').flatMap((c) => [c, ...raw(c)]);
  const text = raw(frame).find((n) => n.type === 'TEXT');
  assert.ok(text, 'khung thử không có text thô để sửa');
  const before = text.characters;
  text.characters = before + ' (đã sửa)';
  return { before, after: text.characters };
}

function flipVariant(env) {
  const insts = all(env.root).filter((n) => n.type === 'INSTANCE' && n.mainSet && n.componentProperties);
  for (const inst of insts) {
    for (const key of Object.keys(inst.componentProperties).filter((k) => inst.componentProperties[k].type === 'VARIANT')) {
      const cur = inst.componentProperties[key].value;
      for (const sib of inst.mainSet.children) {
        const val = Object.fromEntries(sib.name.split(', ').map((p) => p.split('=')))[key];
        if (val === cur) continue;
        try { inst.setProperties({ [key]: val }); } catch (err) { continue; }
        return { inst, key, val };
      }
    }
  }
  return null;
}

function checkTokens(payload) {
  const tok = payload.files['tokens.json'];
  assert.ok(tok.collections.length > 0 && tok.collections.every((c) => c.modes.length && c.variables.length), 'tokens.json: collection/biến');
  const v = tok.collections[0].variables[0];
  assert.ok(v.name && v.type && v.values && v.resolved !== undefined, 'biến có tên, loại, giá trị, giá trị cuối');
  assert.ok(payload.files['index.json'].tokens.variables > 0);
  const comps = payload.files['components.json'];
  assert.ok(comps.page && comps.sets.length > 0, 'components.json: có set');
  assert.ok(comps.sets.every((s) => s.name && Array.isArray(s.variants) && s.variants.length), 'set có biến thể');
  assert.ok(comps.sets.some((s) => Object.keys(s.props).length), 'có property định nghĩa');
}

async function main(bundleArg) {
  const bundle = path.resolve(bundleArg || path.join(__dirname, '..', 'built/code.js'));
  const env = boot(bundle);
  let undo = 0;
  env.figma.commitUndo = () => { undo += 1; };
  await env.call('updateDraft', ARGS);
  const frames = screenFrames(env);
  assert.ok(frames.length >= 2, 'cần ít nhất 2 màn đã dựng');
  undo = 0;

  const page = env.root.children[0];
  const before = snapshot(env.root);
  const first = await read(env, { requestId: 'r1' });
  assert.equal(snapshot(env.root), before, 'readState không được ghi vào tài liệu');
  assert.equal(undo, 0, 'readState không được commitUndo');
  checkShape(first, frames, 'r1');
  checkTokens(first);
  const idx1 = first.files['index.json'];
  assert.equal(idx1.counts.edited, 0, JSON.stringify(idx1.counts));
  assert.ok(rowsOf(first).every((r) => r.status === 'untouched' && r.id && typeof r.w === 'number'), 'màn vừa dựng phải là untouched');
  const again = await read(env, { requestId: 'r1' });
  assert.equal(digest(again), digest(first), 'đọc lại phải ra đúng như cũ');

  const target = frames[0];
  const text = editFrame(target);
  const flip = flipVariant(env);
  const hand = new MockNode('FRAME');
  hand.name = 'Designer tự vẽ';
  page.appendChild(hand);
  const second = await read(env);
  const rows = rowsOf(second);
  const row = rows.find((r) => r.id === target.id);
  assert.equal(row.status, 'edited', 'màn đã đổi chữ phải là edited');
  assert.equal(rows.filter((r) => r.status === 'edited').length >= 1, true);
  const handRow = rows.find((r) => r.id === hand.id);
  assert.ok(handRow && handRow.status === 'handmade' && handRow.screenId === null && handRow.key.startsWith('frame-'), JSON.stringify(handRow));
  assert.ok(second.files[handRow.file], 'khung vẽ tay cũng có tệp cây');
  assert.equal(second.files['index.json'].counts.handmade, 1);
  assert.ok(JSON.stringify(second.files[row.file].tree).includes(text.after), 'cây màn phải mang chữ mới');
  assert.ok(!JSON.stringify(first.files[row.file].tree).includes(text.after));
  if (flip) {
    const hit = all(env.root).filter((n) => n.type === 'INSTANCE').length;
    const tree = JSON.stringify(Object.values(second.files).filter((f) => f.tree).map((f) => f.tree));
    assert.ok(hit > 0 && tree.includes(JSON.stringify({ [flip.key]: flip.val }).slice(1, -1)), 'variant mới phải có trong cây instance');
  }

  // An toàn khi node bị xoá: một khung và một node con biến mất, không được ném lỗi và không còn trong index.
  const gone = frames[1];
  const goneId = gone.id;
  const stale = gone.children[0];
  gone.remove();
  const third = await read(env);
  assert.ok(!rowsOf(third).some((r) => r.id === goneId), 'khung đã xoá không còn trong index');
  assert.ok(stale.removed === true);
  if (process.env.STATE_OUT_DIR) { // verify_bridge.py nạp hai tệp này qua import-state rồi chạy figma-diff (kiểm đầu-cuối plugin -> repo)
    fs.mkdirSync(process.env.STATE_OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.STATE_OUT_DIR, 'before.json'), JSON.stringify(first));
    fs.writeFileSync(path.join(process.env.STATE_OUT_DIR, 'after.json'), JSON.stringify(second));
    fs.writeFileSync(path.join(process.env.STATE_OUT_DIR, 'expect.json'), JSON.stringify({ screenId: row.screenId, text: text.after, variant: flip && { [flip.key]: flip.val }, hand: handRow.name }));
  }
  console.log('verify_state.js: OK · ' + rowsOf(first).length + ' màn, flip variant: ' + (flip ? flip.key + '=' + flip.val : 'không có'));
}

module.exports = main;

async function verifyReadOnly(bundle) {
  const env = boot(bundle);
  const frame = new MockNode('FRAME');
  env.root.children[0].appendChild(frame);
  frame.exportAsync = async ({ format }) => {
    assert.equal(format, 'PNG');
    return Buffer.from('png-test');
  };
  env.figma.base64Encode = (bytes) => bytes.toString('base64');
  const before = snapshot(env.root);
  const state = await read(env);
  assert.equal(rowsOf(state)[0].id, frame.id);
  env.figma.currentPage.selection = [frame];
  assert.equal((await env.call('exportPng', {})).base64, Buffer.from('png-test').toString('base64'));
  await assert.rejects(() => env.call('exportPng', { scale: 0 }), /Scale xuất PNG/);
  for (const command of ['updateDraft', 'ensureLayout', 'rollbackDraft']) {
    await assert.rejects(() => env.call(command, {}), /chỉ đọc trạng thái Figma/);
  }
  assert.equal(snapshot(env.root), before);
  console.log('verify_state.js: kiểm kê đọc được trạng thái và từ chối lệnh ghi');
}

if (require.main === module) {
  const check = process.argv.includes('--read-only') ? verifyReadOnly : main;
  check(process.argv[2]).catch((e) => { console.error(e); process.exit(1); });
}

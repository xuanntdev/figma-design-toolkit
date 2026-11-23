// Figma giả nghiêm ngặt dùng chung cho các kiểm thử cấu hình: MockNode + boot(bundle, pages) trả { root, figma, call, ok }.
// Node đã remove() ném đúng lỗi của Figma thật khi đọc/ghi (xem strict-node.js); getNodeByIdAsync trả null cho node đã xoá.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { strictNode, markRemoved } = require('./strict-node.js');

let seq = 1;
const BY_ID = new Map();

class MockNode {
  constructor(type) {
    Object.assign(this, { id: 'M' + seq++, type, name: type, children: [], parent: null, x: 0, y: 0, width: 100, height: type === 'TEXT' ? 24 : 100, fills: [], strokes: [], _pd: {} });
    const proxy = strictNode(this);
    BY_ID.set(this.id, proxy);
    return proxy;
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

function boot(bundle, pages) {
  const root = new MockNode('DOCUMENT');
  const list = pages && pages.length ? pages : [Object.assign(new MockNode('PAGE'), { name: 'Page 1' })];
  list.forEach((p) => root.appendChild(p));
  const msgs = [];
  const figma = {
    root, currentPage: list[0], ui: { onmessage: null, postMessage: (m) => msgs.push(m) }, showUI() {}, closePlugin() {},
    loadAllPagesAsync: async () => {}, setCurrentPageAsync: async (p) => { figma.currentPage = p; }, loadFontAsync: async () => {}, commitUndo() {},
    getNodeByIdAsync: async (id) => { const n = BY_ID.get(id); return n && !n.removed ? n : null; },
    createPage: () => { const p = new MockNode('PAGE'); root.appendChild(p); return p; },
    createFrame: () => new MockNode('FRAME'), createSection: () => new MockNode('SECTION'), createText: () => new MockNode('TEXT'),
  };
  const sb = { figma, __html__: '<html/>', console };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(bundle, 'utf8'), sb);
  const call = async (name, args) => {
    msgs.length = 0;
    await figma.ui.onmessage({ type: 'PLUGIN_CMD', cmd: { id: 'c', name, args: args || {} } });
    return msgs.find((m) => m.type === 'PLUGIN_RESULT').result;
  };
  const ok = async (name, args) => {
    const r = await call(name, args);
    assert.equal(r.ok, true, name + ': ' + r.error);
    return r.value;
  };
  return { root, figma, call, ok };
}

const all = (node) => node.children.flatMap((c) => [c, ...all(c)]);
const tag = (n, k) => n.getPluginData(k);
const page = (env, name) => env.root.children.find((p) => p.name === name);
const aiFrames = (node) => all(node).filter((n) => n.type === 'FRAME' && tag(n, 'source') === 'ai');
const sections = (node, level) => all(node).filter((n) => n.type === 'SECTION' && tag(n, 'treeLevel') === level);

module.exports = { MockNode, boot, all, tag, page, aiFrames, sections };

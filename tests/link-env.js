// Môi trường giả cho kiểm engine link: MockNode + Figma giả (variables, text style, component) + boot(bundle) trả { root, call, registry, figma }.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { strictNode, markRemoved } = require('./strict-node.js');

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
const install = require('./figma-token-mock')(MockNode);

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
    loadFontAsync: async () => {}, listAvailableFontsAsync: async () => ['Regular', 'SemiBold', 'Bold'].map((style) => ({ fontName: { family: 'Inter', style } })), commitUndo() {},
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

module.exports = { MockNode, boot, all, framesOf };

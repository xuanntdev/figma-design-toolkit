// Bổ sung Figma giả cho verify_project.js: API variables (alias, scopes, code syntax, xoá collection), text style, component / component set /
// instance (component properties TEXT / BOOLEAN / INSTANCE_SWAP, setProperties), boundVariables, findAll/findOne.
// Chỉ đủ cho các API trang Token & Component dùng. Dùng: const install = require('./tests/figma-token-mock')(MockNode); install(figma, root).
module.exports = function extendMock(MockNode) {
  const P = MockNode.prototype;
  P.loadAsync = async function loadAsync() {};
  P.setBoundVariable = function setBoundVariable(field, v) {
    this.boundVariables = this.boundVariables || {};
    if (v === null) delete this.boundVariables[field];
    else this.boundVariables[field] = { type: 'VARIABLE_ALIAS', id: v.id };
  };
  let propSeq = 1;
  const parseVariant = (name) => Object.fromEntries(String(name).split(', ').filter((p) => p.includes('=')).map((p) => p.split('=')));
  // Đổi VARIANT của instance: chuyển sang biến thể anh em có tên khớp, dựng lại ruột (giữ property không phải variant).
  function switchVariant(inst, key, value) {
    const set = inst.mainSet;
    const want = Object.assign({}, parseVariant(inst.mainName), { [key]: value });
    const hit = set && set.children.find((c) => { const p = parseVariant(c.name); return Object.keys(want).every((k) => p[k] === want[k]); });
    if (!hit) throw new Error('Không có biến thể ' + JSON.stringify(want));
    const fresh = hit.createInstance();
    inst.children.slice().forEach((c) => c.remove());
    fresh.children.slice().forEach((c) => inst.appendChild(c));
    inst.mainId = hit.id;
    inst.mainName = hit.name;
    inst.componentProperties[key].value = value;
  }
  P.addComponentProperty = function addComponentProperty(name, type, def) {
    if (this.type !== 'COMPONENT_SET' && this.type !== 'COMPONENT') throw new Error('addComponentProperty chỉ cho component / component set');
    if (!['TEXT', 'BOOLEAN', 'INSTANCE_SWAP'].includes(type)) throw new Error('Loại property không hợp lệ: ' + type);
    if (type === 'INSTANCE_SWAP' && (typeof def !== 'string' || !def)) throw new Error('INSTANCE_SWAP cần id component mặc định');
    const key = name + '#' + propSeq++;
    this.componentPropertyDefinitions = this.componentPropertyDefinitions || {};
    this.componentPropertyDefinitions[key] = { type, defaultValue: def };
    return key;
  };
  P.setProperties = function setProperties(map) {
    for (const key of Object.keys(map)) {
      if (!this.componentProperties || !this.componentProperties[key]) throw new Error('Không có property ' + key);
      if (this.componentProperties[key].type === 'VARIANT') { switchVariant(this, key, map[key]); continue; }
      this.componentProperties[key].value = map[key];
      if (this.componentProperties[key].type === 'TEXT') {
        this.findAll((n) => n.componentPropertyReferences && n.componentPropertyReferences.characters === key).forEach((n) => { n.characters = map[key]; });
      }
    }
  };
  P.setTextStyleIdAsync = async function setTextStyleIdAsync(id) { this.textStyleId = id; };
  P.findAll = function findAll(fn) {
    const out = [];
    const walk = (n) => { n.children.forEach((c) => { if (fn(c)) out.push(c); walk(c); }); };
    walk(this);
    return out;
  };
  P.findOne = function findOne(fn) { return this.findAll(fn)[0] || null; };
  P.createInstance = function createInstance() {
    const copy = (n, type) => {
      const c = new MockNode(type || n.type);
      Object.assign(c, { name: n.name, width: n.width, height: n.height, _chars: n._chars, visible: n.visible, componentPropertyReferences: n.componentPropertyReferences });
      if (n.mainId) Object.assign(c, { mainId: n.mainId, mainName: n.mainName, mainSet: n.mainSet });
      if (n.componentProperties) c.componentProperties = JSON.parse(JSON.stringify(n.componentProperties));
      n.children.forEach((k) => c.appendChild(copy(k, k.type === 'INSTANCE' ? 'INSTANCE' : null)));
      return c;
    };
    const inst = copy(this, 'INSTANCE');
    inst.mainId = this.id;
    inst.mainName = this.name;
    inst.mainSet = this.parent && this.parent.type === 'COMPONENT_SET' ? this.parent : null;
    const defs = (this.parent && this.parent.componentPropertyDefinitions) || {};
    inst.componentProperties = {};
    if (inst.mainSet) Object.entries(parseVariant(this.name)).forEach(([k, v]) => { inst.componentProperties[k] = { type: 'VARIANT', value: v }; });
    Object.keys(defs).forEach((k) => { inst.componentProperties[k] = { type: defs[k].type, value: defs[k].defaultValue }; });
    return inst;
  };

  // Giả lập "sửa component thì mọi instance đổi theo": dựng lại ruột mỗi instance từ component gốc, giữ giá trị property đã override.
  // Áp lại giá trị property đã override (đúng như Figma giữ override khi component gốc đổi): TEXT cập nhật chữ, VARIANT chuyển biến thể.
  function restoreProps(inst, old) {
    if (inst.removed) return;
    Object.keys(old || {}).forEach((k) => {
      const cur = inst.componentProperties && inst.componentProperties[k];
      if (!cur || cur.value === old[k].value) return;
      inst.setProperties({ [k]: old[k].value });
    });
  }

  P.syncInstances = function syncInstances(byId) {
    for (const inst of this.findAll((n) => n.type === 'INSTANCE' && n.mainId && byId[n.mainId])) {
      if (inst.removed) continue;
      const oldTop = JSON.parse(JSON.stringify(inst.componentProperties || {}));
      const oldNested = inst.findAll((n) => n.type === 'INSTANCE').map((n) => JSON.parse(JSON.stringify(n.componentProperties || {})));
      const fresh = byId[inst.mainId].createInstance();
      inst.children.slice().forEach((c) => c.remove());
      fresh.children.slice().forEach((c) => inst.appendChild(c));
      restoreProps(inst, oldTop);
      inst.findAll((n) => n.type === 'INSTANCE').forEach((n, i) => restoreProps(n, oldNested[i]));
    }
  };

  return function install(figma, root) {
    let seq = 1;
    const collections = [];
    const variables = [];
    const styles = [];
    const sets = [];
    figma.variables = {
      getLocalVariableCollectionsAsync: async () => collections.slice(),
      createVariableCollection(name) {
        const c = {
          id: 'VC' + seq++, name, modes: [{ modeId: 'm1', name: 'Mode 1' }], renameMode(id, n) { this.modes.find((m) => m.modeId === id).name = n; },
          remove() {
            collections.splice(collections.indexOf(this), 1);
            for (let i = variables.length - 1; i >= 0; i -= 1) if (variables[i].variableCollectionId === this.id) variables.splice(i, 1);
          },
        };
        collections.push(c);
        return c;
      },
      getLocalVariablesAsync: async () => variables.slice(),
      createVariableAlias: (v) => ({ type: 'VARIABLE_ALIAS', id: v.id }),
      createVariable(name, col, type) {
        assertCollection(col);
        const v = { id: 'V' + seq++, name, type, variableCollectionId: col.id, values: {}, scopes: ['ALL_SCOPES'], codeSyntax: {}, description: '',
          setValueForMode(m, val) { this.values[m] = val; },
          setVariableCodeSyntax(platform, v2) { this.codeSyntax[platform] = v2; } };
        variables.push(v);
        return v;
      },
      setBoundVariableForPaint: (paint, field, v) => Object.assign({}, paint, { boundVariables: { [field]: { type: 'VARIABLE_ALIAS', id: v.id } } }),
    };
    function assertCollection(col) {
      if (!col || typeof col !== 'object' || !col.id) throw new Error('createVariable cần collection');
    }
    figma.getLocalTextStylesAsync = async () => styles.slice();
    figma.createTextStyle = () => {
      const s = { id: 'S' + seq++, name: '', boundVariables: {}, setBoundVariable(f, v) { this.boundVariables[f] = { type: 'VARIABLE_ALIAS', id: v.id }; } };
      styles.push(s);
      return s;
    };
    figma.createComponent = () => {
      const c = new MockNode('COMPONENT');
      figma.currentPage.appendChild(c);
      c.createInstance = P.createInstance;
      return c;
    };
    figma.combineAsVariants = (nodes, parent) => {
      const set = new MockNode('COMPONENT_SET');
      parent.appendChild(set);
      nodes.forEach((n) => set.appendChild(n));
      sets.push(set);
      return set;
    };
    return { collections, variables, styles, sets };
  };
};

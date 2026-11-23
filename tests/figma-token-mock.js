// Bổ sung Figma giả cho verify_project.js: API variables, text style, component / component set / instance, findAll/findOne.
// Chỉ đủ cho các API trang Token & Component dùng. Dùng: const install = require('./tests/figma-token-mock')(MockNode); install(figma, root).
module.exports = function extendMock(MockNode) {
  const P = MockNode.prototype;
  P.loadAsync = async function loadAsync() {};
  P.setBoundVariable = function setBoundVariable(field, v) { (this.bound = this.bound || {})[field] = v.id; };
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
      Object.assign(c, { name: n.name, width: n.width, height: n.height, _chars: n._chars });
      n.children.forEach((k) => c.appendChild(copy(k)));
      return c;
    };
    const inst = copy(this, 'INSTANCE');
    inst.mainId = this.id;
    return inst;
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
        const c = { id: 'VC' + seq++, name, modes: [{ modeId: 'm1', name: 'Mode 1' }], renameMode(id, n) { this.modes.find((m) => m.modeId === id).name = n; } };
        collections.push(c);
        return c;
      },
      getLocalVariablesAsync: async () => variables.slice(),
      createVariable(name, col, type) {
        assertCollection(col);
        const v = { id: 'V' + seq++, name, type, variableCollectionId: col.id, values: {}, scopes: [], description: '', setValueForMode(m, val) { this.values[m] = val; } };
        variables.push(v);
        return v;
      },
      setBoundVariableForPaint: (paint, field, v) => Object.assign({}, paint, { boundVariables: { [field]: { id: v.id } } }),
    };
    function assertCollection(col) {
      if (!col || typeof col !== 'object' || !col.id) throw new Error('createVariable cần collection');
    }
    figma.getLocalTextStylesAsync = async () => styles.slice();
    figma.createTextStyle = () => { const s = { id: 'S' + seq++, name: '' }; styles.push(s); return s; };
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

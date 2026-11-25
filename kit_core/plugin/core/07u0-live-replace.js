// Thay layer vẽ tay bằng instance của component (gộp về component chung) trong lượt edit/stage: mục sửa dạng
// { nodeId, replace: { componentId, properties?: { Tên gốc: giá trị }, keepSize?: true } }. Instance chèn đúng vị trí trong cha,
// giữ cách co giãn theo auto layout (và kích thước khi cố định), đặt property, giữ tên layer; layer cũ bị xoá. Cả lượt là một bước hoàn tác.

const LIVE_LAYOUT_KEYS = ['layoutPositioning', 'layoutAlign', 'layoutGrow', 'constraints'];

function liveInsideInstance(node) {
  for (let n = node.parent; n && n.type !== 'PAGE'; n = n.parent) if (n.type === 'INSTANCE') return true;
  return false;
}

async function liveReplaceComponent(spec) {
  if (!liveRecord(spec) || typeof spec.componentId !== 'string') throw new Error('replace cần componentId.');
  const comp = await figma.getNodeByIdAsync(spec.componentId);
  if (!comp || comp.type !== 'COMPONENT') throw new Error('replace cần ID một component (biến thể cụ thể): ' + spec.componentId);
  if (spec.properties != null && !liveRecord(spec.properties)) throw new Error('replace.properties phải là đối tượng.');
  return comp;
}

function liveReplaceProps(inst, props) {
  const map = {};
  for (const [base, value] of Object.entries(props || {})) {
    const key = Object.keys(inst.componentProperties || {}).find((k) => k === base || k.split('#')[0] === base);
    if (!key) throw new Error('Component không có property ' + base);
    map[key] = value;
  }
  if (Object.keys(map).length) inst.setProperties(map);
}

function liveCopyLayout(inst, node, keepSize) {
  const parent = node.parent;
  const auto = parent && parent.layoutMode && parent.layoutMode !== 'NONE' && node.layoutPositioning !== 'ABSOLUTE';
  for (const key of LIVE_LAYOUT_KEYS) {
    if (key in node && !isMixed(node[key])) try { inst[key] = node[key]; } catch (err) { /* cha không nhận thuộc tính này */ }
  }
  if (!auto) {
    inst.x = node.x;
    inst.y = node.y;
  }
  const fixed = [];
  for (const key of ['layoutSizingHorizontal', 'layoutSizingVertical']) {
    if (!(key in node)) continue;
    if (auto || node[key] !== 'FILL') try { inst[key] = node[key]; } catch (err) { /* instance không hug được */ }
    if (node[key] === 'FIXED' || !(key in inst)) fixed.push(key);
  }
  if (keepSize && fixed.length) {
    const w = fixed.includes('layoutSizingHorizontal') ? node.width : inst.width;
    const h = fixed.includes('layoutSizingVertical') ? node.height : inst.height;
    inst.resize(w, h);
  }
}

async function liveReplaceStep(node, spec) {
  if (liveComponent(node) || liveInsideInstance(node) || node.type === 'INSTANCE') {
    throw new Error('Chỉ thay layer vẽ tay (không nằm trong component/instance): ' + node.id);
  }
  const comp = await liveReplaceComponent(spec);
  const label = comp.parent && comp.parent.type === 'COMPONENT_SET' ? comp.parent.name + ' / ' + comp.name : comp.name;
  const apply = async () => {
    const parent = node.parent;
    const inst = comp.createInstance();
    parent.insertChild(parent.children.indexOf(node), inst);
    inst.name = node.name;
    liveCopyLayout(inst, node, spec.keepSize !== false);
    liveReplaceProps(inst, spec.properties);
    node.remove();
  };
  const restore = () => { throw new Error('Không khôi phục được layer đã thay'); };
  return { key: 'replace', before: { type: node.type, name: node.name }, after: { component: label, properties: spec.properties || {} }, apply, restore };
}

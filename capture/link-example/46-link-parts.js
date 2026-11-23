// Ví dụ engine link (2/4) — hàm dựng chung cho component mẫu: tra biến / text style theo tên, tô màu bằng biến, chữ gắn text style.
// Component dùng auto layout; fill, viền, bo góc, màu chữ đều bind vào biến (không ghi giá trị thô).
const LKX_LIB = { vars: {}, styles: {} };

async function lkxLoadLib() {
  LKX_LIB.vars = {};
  LKX_LIB.styles = {};
  (await figma.variables.getLocalVariablesAsync()).forEach((v) => { LKX_LIB.vars[v.name] = v; });
  (await figma.getLocalTextStylesAsync()).forEach((s) => { LKX_LIB.styles[s.name] = s; });
}

function lkxPaint(varName) {
  return figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', LKX_LIB.vars[varName]);
}

function lkxRadius(node, varName) {
  ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach((f) => node.setBoundVariable(f, LKX_LIB.vars[varName]));
}

// Frame auto layout ngang (padding px/py, khoảng cách gap), tự co theo nội dung; fill = tên biến hoặc null (trong suốt).
function lkxRow(node, opts) {
  node.layoutMode = 'HORIZONTAL';
  node.primaryAxisSizingMode = 'AUTO';
  node.counterAxisSizingMode = 'AUTO';
  node.primaryAxisAlignItems = opts.justify || 'CENTER';
  node.counterAxisAlignItems = 'CENTER';
  node.paddingLeft = node.paddingRight = opts.px || 0;
  node.paddingTop = node.paddingBottom = opts.py || 0;
  node.itemSpacing = opts.gap || 0;
  node.fills = opts.fill ? [lkxPaint(opts.fill)] : [];
}

async function lkxText(parent, chars, name, styleName, colorVar) {
  const style = LKX_LIB.styles[styleName];
  await figma.loadFontAsync(style.fontName);
  const t = figma.createText();
  parent.appendChild(t);
  t.name = name;
  t.fontName = style.fontName;
  t.characters = chars;
  await t.setTextStyleIdAsync(style.id);
  t.fills = [lkxPaint(colorVar)];
  return t;
}

// COMPONENT nằm thẳng trên trang Token, xếp lưới theo `index` (variant không chồng nhau), mang plugin data <linkTag>=<key> để engine tìm.
function lkxComponent(page, name, key, index) {
  const c = figma.createComponent();
  page.appendChild(c);
  c.name = name;
  c.x = index * 220;
  c.y = 0;
  c.setPluginData(typeof lkTag === 'function' ? lkTag() : 'linkComp', key);
  return c;
}

// Gộp các variant thành component set + text property: mỗi text con tên `props[tên property]` được gắn vào property đó.
function lkxCombine(variants, page, setName, props) {
  const set = figma.combineAsVariants(variants, page);
  set.name = setName;
  Object.keys(props || {}).forEach((prop) => {
    const key = set.addComponentProperty(prop, 'TEXT', props[prop].def);
    variants.forEach((c) => { c.findOne((n) => n.name === props[prop].node).componentPropertyReferences = { characters: key }; });
  });
  return set;
}

const LIVE_NUMBERS = new Set([
  'x', 'y', 'rotation', 'opacity', 'cornerRadius', 'itemSpacing', 'counterAxisSpacing',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'strokeWeight', 'fontSize',
]);
const LIVE_ENUMS = {
  layoutMode: ['NONE', 'HORIZONTAL', 'VERTICAL'],
  layoutSizingHorizontal: ['FIXED', 'HUG', 'FILL'],
  layoutSizingVertical: ['FIXED', 'HUG', 'FILL'],
  primaryAxisAlignItems: ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'],
  counterAxisAlignItems: ['MIN', 'CENTER', 'MAX', 'BASELINE'],
  layoutAlign: ['INHERIT', 'STRETCH'], layoutPositioning: ['AUTO', 'ABSOLUTE'],
  layoutWrap: ['NO_WRAP', 'WRAP'],
  textAlignHorizontal: ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'],
  textAlignVertical: ['TOP', 'CENTER', 'BOTTOM'],
  textAutoResize: ['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'],
};
const LIVE_STYLES = {
  textStyleId: 'setTextStyleIdAsync', fillStyleId: 'setFillStyleIdAsync',
  strokeStyleId: 'setStrokeStyleIdAsync', effectStyleId: 'setEffectStyleIdAsync',
};

function liveRecord(data) {
  return data && typeof data === 'object' && !Array.isArray(data);
}

function liveStable(value) {
  if (Array.isArray(value)) return value.map(liveStable);
  if (liveRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, liveStable(value[key])]));
  return value;
}

function liveEqual(a, b) {
  return JSON.stringify(liveStable(a)) === JSON.stringify(liveStable(b));
}

function liveFinite(value, minimum = -100000, maximum = 100000) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function liveFont(font) {
  return liveRecord(font) && typeof font.family === 'string' && typeof font.style === 'string';
}

async function liveVariable(id) {
  const value = typeof id === 'string' && await figma.variables?.getVariableByIdAsync(id);
  if (!value) throw new Error('Không tìm thấy biến Figma: ' + id);
  return value;
}

async function livePaint(spec) {
  if (!liveRecord(spec) || (spec.color != null && !/^#[a-fA-F0-9]{6}$/.test(spec.color))) throw new Error('Màu cần định dạng #RRGGBB.');
  if (spec.opacity != null && !liveFinite(spec.opacity, 0, 1)) throw new Error('Opacity của màu phải trong khoảng 0–1.');
  if (!spec.color && !spec.variableId) throw new Error('Cần màu hoặc variableId.');
  const [paint] = stSolid(spec.color || '#000000', spec.opacity);
  if (!spec.variableId) return paint;
  const variable = await liveVariable(spec.variableId);
  if (variable.resolvedType !== 'COLOR') throw new Error('Màu phải được gắn với biến COLOR.');
  return figma.variables.setBoundVariableForPaint(paint, 'color', variable);
}

function liveBasicValue(key, value) {
  if (LIVE_NUMBERS.has(key)) return liveFinite(value, key === 'opacity' ? 0 : -100000, key === 'opacity' ? 1 : 100000);
  if (Object.hasOwn(LIVE_ENUMS, key)) return LIVE_ENUMS[key].includes(value);
  if (['name', 'characters'].includes(key)) return typeof value === 'string' && value.length <= 50000;
  if (['visible', 'clipsContent'].includes(key)) return typeof value === 'boolean';
  if (key === 'fontName') return liveFont(value);
  if (['letterSpacing', 'lineHeight'].includes(key)) {
    if (key === 'lineHeight' && value?.unit === 'AUTO') return true;
    return ['PIXELS', 'PERCENT'].includes(value?.unit) && liveFinite(value.value);
  }
  return false;
}

async function liveComponentStep(node, changes) {
  if (node.type !== 'INSTANCE' || !liveRecord(changes)) throw new Error('componentProperties cần một instance.');
  const props = node.componentProperties;
  const before = {};
  for (const [key, value] of Object.entries(changes)) {
    if (!Object.hasOwn(props, key) || !['string', 'boolean'].includes(typeof value)) throw new Error('Property instance không hợp lệ: ' + key);
    before[key] = props[key].value;
  }
  return { key: 'componentProperties', before, after: changes, apply: (value) => node.setProperties(value) };
}

async function liveBindingStep(node, changes) {
  if (!liveRecord(changes) || typeof node.setBoundVariable !== 'function') throw new Error('Layer không hỗ trợ gắn biến.');
  const before = {};
  const permitted = new Set([...LIVE_NUMBERS, 'characters', 'width', 'height']);
  const variables = new Map();
  for (const [key, id] of Object.entries(changes)) {
    if (!permitted.has(key)) throw new Error('Trường gắn biến chưa được hỗ trợ: ' + key);
    if (id !== null && typeof id !== 'string') throw new Error('Binding cần ID biến hoặc null.');
    before[key] = node.boundVariables?.[key]?.id || null;
    for (const varId of [before[key], id]) if (varId) variables.set(varId, await liveVariable(varId));
  }
  const apply = (values) => {
    for (const [key, id] of Object.entries(values)) node.setBoundVariable(key, variables.get(id) || null);
  };
  return { key: 'bindings', before, after: changes, apply };
}

async function liveStep(node, key, value) {
  if (key === 'componentProperties') return liveComponentStep(node, value);
  if (key === 'bindings') return liveBindingStep(node, value);
  if (key === 'size') {
    if (!liveRecord(value) || !liveFinite(value.width, 0.01) || !liveFinite(value.height, 0.01) || typeof node.resize !== 'function') {
      throw new Error('size cần width và height dương trên layer đổi được kích thước.');
    }
    return { key, before: { width: node.width, height: node.height }, after: value, apply: (v) => node.resize(v.width, v.height) };
  }
  if (!(key in node) || isMixed(node[key])) throw new Error('Thuộc tính không thể sửa an toàn: ' + key);
  if (Object.hasOwn(LIVE_STYLES, key) && typeof value === 'string' && typeof node[LIVE_STYLES[key]] === 'function') {
    if (value && !await figma.getStyleByIdAsync(value)) throw new Error('Không tìm thấy style: ' + value);
    return { key, before: node[key], after: value, apply: (v) => node[LIVE_STYLES[key]](v) };
  }
  if (['fills', 'strokes'].includes(key) && Array.isArray(value) && value.length <= 12) {
    const after = await Promise.all(value.map(livePaint));
    const styleKey = key === 'fills' ? 'fillStyleId' : 'strokeStyleId';
    const originalStyle = node[styleKey];
    return {
      key, before: node[key], after, apply: (v) => { node[key] = v; },
      restore: originalStyle ? () => node[LIVE_STYLES[styleKey]](originalStyle) : null,
      context: originalStyle || null,
    };
  }
  if (!liveBasicValue(key, value)) throw new Error('Giá trị hoặc thuộc tính chưa được hỗ trợ: ' + key);
  return { key, before: node[key], after: value, apply: (v) => { node[key] = v; } };
}

async function liveLoadText(node, set) {
  if (node.type !== 'TEXT' || !['characters', 'fontSize', 'fontName', 'textStyleId', 'letterSpacing', 'lineHeight'].some((key) => Object.hasOwn(set, key))) return;
  if (!liveFont(node.fontName)) throw new Error('Text có nhiều font. Sửa property text của instance hoặc chọn layer có một font.');
  await figma.loadFontAsync(node.fontName);
  if (Object.hasOwn(set, 'fontName') && liveFont(set.fontName)) await figma.loadFontAsync(set.fontName);
}

async function liveSteps(node, set) {
  if (!liveRecord(set) || !Object.keys(set).length) throw new Error('Thiếu thuộc tính cần sửa.');
  await liveLoadText(node, set);
  const steps = [];
  for (const [key, value] of Object.entries(set)) steps.push(await liveStep(node, key, value));
  return steps;
}

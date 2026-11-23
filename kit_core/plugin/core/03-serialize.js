// Turns a Figma node into compact JSON an agent can read (read-only; never writes).
const SERIALIZE_PLUGIN_KEYS = ['source', 'status', 'screenId'];

function isMixed(v) {
  return typeof v === 'symbol';
}

function toHex(c) {
  const h = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + h(c.r) + h(c.g) + h(c.b);
}

function serializePaints(paints) {
  if (!Array.isArray(paints)) return isMixed(paints) ? 'mixed' : undefined;
  return paints.filter((p) => p.visible !== false).map((p) => (
    p.type === 'SOLID'
      ? { type: 'SOLID', color: toHex(p.color), opacity: p.opacity == null ? 1 : p.opacity }
      : { type: p.type }
  ));
}

function serializeBase(node) {
  const out = { id: node.id, name: node.name, type: node.type };
  for (const k of ['x', 'y', 'width', 'height']) {
    if (typeof node[k] === 'number') out[k] = Math.round(node[k] * 100) / 100;
  }
  if (node.visible === false) out.visible = false;
  if (node.locked) out.locked = true;
  return out;
}

function serializeLayout(node) {
  if (!('layoutMode' in node) || node.layoutMode === 'NONE') return {};
  const out = { layoutMode: node.layoutMode, itemSpacing: node.itemSpacing };
  for (const k of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) out[k] = node[k];
  return out;
}

function serializeStyle(node) {
  const out = {};
  if ('fills' in node) out.fills = serializePaints(node.fills);
  if ('strokes' in node && node.strokes.length) out.strokes = serializePaints(node.strokes);
  if ('cornerRadius' in node && typeof node.cornerRadius === 'number' && node.cornerRadius) {
    out.cornerRadius = node.cornerRadius;
  }
  if (node.boundVariables && Object.keys(node.boundVariables).length) out.boundVariables = node.boundVariables;
  return out;
}

function serializeText(node) {
  if (node.type !== 'TEXT') return {};
  const out = { characters: node.characters };
  if (typeof node.fontSize === 'number') out.fontSize = node.fontSize;
  if (node.fontName && !isMixed(node.fontName)) out.fontName = node.fontName;
  return out;
}

function serializePluginData(node) {
  const out = {};
  for (const k of SERIALIZE_PLUGIN_KEYS) {
    const v = node.getPluginData ? node.getPluginData(k) : '';
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? { pluginData: out } : {};
}

// depth: levels of children still to descend; budget.left: nodes still allowed to be read (caps huge trees).
function serializeNode(node, depth, budget) {
  budget.left -= 1;
  const out = Object.assign(
    serializeBase(node), serializeLayout(node), serializeStyle(node), serializeText(node), serializePluginData(node)
  );
  if (!node.children || !node.children.length) return out;
  if (depth <= 0 || budget.left <= 0) {
    out.truncated = true;
    return out;
  }
  out.children = node.children.map((c) => serializeNode(c, depth - 1, budget));
  return out;
}

// Chiều ngược Figma -> repo (2/3): đọc token (biến + text style) và component trên trang Token & Component. Thuần đọc, API bất đồng bộ.

function rsHasVariables() {
  return !!(figma.variables && figma.variables.getLocalVariablesAsync);
}

// Bản đồ id -> tên cho biến và text style cục bộ (nén cây node không phải gọi API từng node).
async function rsContext(maxNodes) {
  const vars = new Map();
  const styles = new Map();
  if (rsHasVariables()) (await figma.variables.getLocalVariablesAsync()).forEach((v) => vars.set(v.id, v.name));
  if (figma.getLocalTextStylesAsync) (await figma.getLocalTextStylesAsync()).forEach((s) => styles.set(s.id, s.name));
  return { vars, styles, names: new Map(), budget: { left: maxNodes } };
}

// Màu theo khoá của engine link (#rrggbb, thêm @alpha khi trong suốt) để so trực tiếp với bảng token của extension.
function rsColorKey(c) {
  return lkColorKey(toHex(c), c.a);
}

function rsValue(val, ctx) {
  if (val && val.type === 'VARIABLE_ALIAS') return { alias: ctx.vars.get(val.id) || val.id };
  if (val && typeof val === 'object' && typeof val.r === 'number') return rsColorKey(val);
  return val;
}

// Giá trị cuối của biến ở mode mặc định của collection của nó (đi theo chuỗi alias, tối đa 8 bước).
function rsResolve(v, byId, cols, depth) {
  const col = cols.get(v.variableCollectionId);
  const val = v.valuesByMode && col ? v.valuesByMode[col.defaultModeId || (col.modes[0] && col.modes[0].modeId)] : undefined;
  if (val && val.type === 'VARIABLE_ALIAS' && depth < 8 && byId.get(val.id)) return rsResolve(byId.get(val.id), byId, cols, depth + 1);
  return val && val.type === 'VARIABLE_ALIAS' ? undefined : val;
}

function rsVariable(v, col, ctx, byId, cols) {
  const values = {};
  for (const m of col.modes) values[m.name] = rsValue((v.valuesByMode || {})[m.modeId], ctx);
  const out = { id: v.id, name: v.name, type: v.resolvedType, values, resolved: rsValue(rsResolve(v, byId, cols, 0), ctx) };
  if (v.scopes && v.scopes.length) out.scopes = v.scopes;
  if (v.codeSyntax && Object.keys(v.codeSyntax).length) out.codeSyntax = v.codeSyntax;
  if (v.description) out.description = v.description;
  return out;
}

function rsLineHeight(lh) {
  if (!lh || isMixed(lh)) return undefined;
  if (lh.unit === 'AUTO') return 'auto';
  return lh.unit === 'PERCENT' ? lh.value + '%' : lh.value;
}

function rsTextStyle(s, ctx) {
  const out = { id: s.id, name: s.name };
  if (s.fontName) out.font = s.fontName.family + ' ' + s.fontName.style;
  if (s.fontSize != null) out.size = s.fontSize;
  const lh = rsLineHeight(s.lineHeight);
  if (lh !== undefined) out.lineHeight = lh;
  const vars = {};
  for (const k of Object.keys(s.boundVariables || {})) {
    const a = s.boundVariables[k];
    if (a && ctx.vars.get(a.id)) vars[k] = ctx.vars.get(a.id);
  }
  if (Object.keys(vars).length) out.vars = vars;
  if (s.description) out.description = s.description;
  return out;
}

// Bảng token mà extension khai cho engine link (hex -> biến, số -> biến Radius, text style): nguồn repo để figma-diff đối chiếu.
function rsRepoTokens() {
  const ext = typeof lkExt === 'function' ? lkExt() : null;
  if (!ext || typeof ext.linkTokens !== 'function') return null;
  try { return ext.linkTokens() || null; } catch (err) { return null; }
}

async function rsTokens(ctx) {
  const collections = [];
  if (rsHasVariables()) {
    const cols = new Map();
    (await figma.variables.getLocalVariableCollectionsAsync()).forEach((c) => cols.set(c.id, c));
    const all = await figma.variables.getLocalVariablesAsync();
    const byId = new Map(all.map((v) => [v.id, v]));
    for (const col of cols.values()) {
      const vars = all.filter((v) => v.variableCollectionId === col.id).map((v) => rsVariable(v, col, ctx, byId, cols));
      collections.push({ id: col.id, name: col.name, modes: col.modes.map((m) => m.name), modeIds: Object.fromEntries(col.modes.map((m) => [m.name, m.modeId])), variables: vars });
    }
  }
  const styles = figma.getLocalTextStylesAsync ? await figma.getLocalTextStylesAsync() : [];
  const getStyles = (styles) => styles.map(({ id, name }) => ({ id, name }));
  const paintStyles = getStyles(await figma.getLocalPaintStylesAsync?.() || []);
  const effectStyles = getStyles(await figma.getLocalEffectStylesAsync?.() || []);
  return { collections, textStyles: styles.map((s) => rsTextStyle(s, ctx)), paintStyles, effectStyles, repo: rsRepoTokens() };
}

function rsTokenPageName() {
  try { return stOpts().pageTokens; } catch (err) { return ST_LABELS.pageTokens; }
}

async function rsPropDefs(defs, ctx) {
  const out = {};
  for (const k of Object.keys(defs || {})) {
    const d = defs[k];
    const row = { type: d.type, default: d.type === 'INSTANCE_SWAP' ? await rsNameOf(d.defaultValue, ctx) : d.defaultValue };
    if (d.variantOptions) row.options = d.variantOptions;
    out[k.split('#')[0]] = { ...row, propertyId: k };
  }
  return out;
}

async function rsComponentSet(set, ctx) {
  const tag = typeof lkTag === 'function' ? stTagOf(set, lkTag()) : '';
  const out = { id: set.id, name: set.name, description: set.description || '', props: await rsPropDefs(set.componentPropertyDefinitions, ctx) };
  if (tag) out.key = tag;
  out.variants = (set.children || []).filter((c) => !c.removed).map((c) => c.name);
  out.variantNodes = (set.children || []).filter((c) => !c.removed).map((c) => ({ id: c.id, name: c.name }));
  return out;
}

async function rsComponents(ctx) {
  const sets = [];
  const components = [];
  for (const page of figma.root.children) {
    const meta = { pageId: page.id, page: page.name };
    for (const node of page.findAll((n) => n.type === 'COMPONENT' || n.type === 'COMPONENT_SET')) {
      if (node.type === 'COMPONENT_SET') sets.push({ ...await rsComponentSet(node, ctx), ...meta });
      else if (node.parent?.type !== 'COMPONENT_SET') {
        components.push({ id: node.id, name: node.name, description: node.description || '', ...meta });
      }
    }
  }
  return { page: sets[0]?.page || components[0]?.page || null, sets, components };
}

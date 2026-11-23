// Ví dụ engine link (1/4) — token của trang "Token & Component": biến Color / Radius + text style, và bảng tra hex/số/kiểu chữ -> tên biến/style
// để engine gắn token cho khối thô (DESIGN_EXTENSION.linkTokens). Ví dụ gọn: một collection; bộ chuẩn đầy đủ (Primitives -> Color alias…) xem docs/nguyen-tac.md.
const LKX_COLORS = [ // [tên biến, hex, scopes]
  ['color/bg/page', '#f5f7fb', ['FRAME_FILL']],
  ['color/bg/surface', '#ffffff', ['FRAME_FILL', 'SHAPE_FILL']],
  ['color/bg/accent', '#2563eb', ['FRAME_FILL', 'SHAPE_FILL']],
  ['color/bg/accent-soft', '#e0ecff', ['FRAME_FILL', 'SHAPE_FILL']],
  ['color/bg/muted', '#f0f2f5', ['FRAME_FILL', 'SHAPE_FILL']],
  ['color/bg/divider', '#e6eaf0', ['FRAME_FILL', 'SHAPE_FILL']],
  ['color/border/default', '#e6eaf0', ['STROKE_COLOR']],
  ['color/text/default', '#141a24', ['TEXT_FILL']],
  ['color/text/muted', '#4b5567', ['TEXT_FILL']],
  ['color/text/inverse', '#ffffff', ['TEXT_FILL']],
  ['color/text/accent', '#2563eb', ['TEXT_FILL']],
];
const LKX_RADII = [['radius/lg', 12], ['radius/pill', 999]];
const LKX_TEXT_STYLES = [ // [tên style, font style của Inter, cỡ, line-height px]
  ['Heading/H1', 'Bold', 24, 36],
  ['Body/Strong', 'Bold', 14, 21],
  ['Body/Medium', 'Regular', 14, 21],
  ['Caption/Regular', 'Regular', 12, 18],
];

function lkxHexToRgb(hex) {
  const c = stSolid(hex, 1)[0].color;
  return { r: c.r, g: c.g, b: c.b, a: 1 };
}

// Mọi biến có scopes đúng loại + code syntax WEB; chỉ tạo biến còn thiếu (không ghi đè giá trị designer đã sửa).
function lkxPutVariable(vars, col, have, row) {
  const [name, value, scopes] = row;
  if (have[name]) return false;
  const isColor = typeof value === 'string';
  const v = vars.createVariable(name, col, isColor ? 'COLOR' : 'FLOAT');
  v.setValueForMode(col.modes[0].modeId, isColor ? lkxHexToRgb(value) : value);
  v.scopes = scopes || ['CORNER_RADIUS'];
  v.setVariableCodeSyntax('WEB', 'var(--' + name.replace(/\//g, '-') + ')');
  return true;
}

async function lkxEnsureVariables() {
  const vars = figma.variables;
  const col = (await vars.getLocalVariableCollectionsAsync()).find((c) => c.name === 'Tokens') || vars.createVariableCollection('Tokens');
  const have = {};
  (await vars.getLocalVariablesAsync()).forEach((v) => { have[v.name] = v; });
  const rows = LKX_COLORS.concat(LKX_RADII);
  return rows.filter((row) => lkxPutVariable(vars, col, have, row)).length;
}

async function lkxEnsureTextStyles() {
  const have = new Set((await figma.getLocalTextStylesAsync()).map((s) => s.name));
  let created = 0;
  for (const [name, style, size, lh] of LKX_TEXT_STYLES) {
    if (have.has(name)) continue;
    await figma.loadFontAsync({ family: 'Inter', style });
    const s = figma.createTextStyle();
    s.name = name;
    s.fontName = { family: 'Inter', style };
    s.fontSize = size;
    s.lineHeight = { value: lh, unit: 'PIXELS' };
    created += 1;
  }
  return created;
}

// Bảng tra cho engine: khoá = hex (chữ thường) / số bo góc / (family, style, cỡ, line-height); giá trị = tên biến / text style ở trên.
function lkxTokens() {
  const pick = (prefix) => Object.fromEntries(LKX_COLORS.filter((r) => r[0].startsWith(prefix)).map((r) => [r[1], r[0]]));
  return {
    fill: pick('color/bg/'),
    stroke: pick('color/border/'),
    text: pick('color/text/'),
    radius: Object.fromEntries(LKX_RADII.map((r) => [r[1], r[0]])),
    textStyles: LKX_TEXT_STYLES.map(([name, style, size, lineHeight]) => ({ name, family: 'Inter', style, size, lineHeight })),
  };
}

// Rà soát thiết kế trực tiếp trên Figma: màu thô (chưa gắn biến/style), chữ chưa có text style, instance đã detach, khung bọc thừa.
// Bỏ qua instance (lỗi thuộc component, báo một lần ở component). Chỉ trả số đếm + danh sách đầu có trần kèm id để sửa (edit/stage). THUẦN ĐỌC.

const LINT_LIMIT = 100;
const LINT_RULES = ['raw-fill', 'raw-stroke', 'no-text-style', 'detached', 'wrapper'];
const LINT_MIN_OPACITY = 0.01; // dưới 1% coi như không hiển thị (lớp đổ bóng giả, nền gần trong suốt)

function lintShown(p) {
  return p.visible !== false && !(typeof p.opacity === 'number' && p.opacity < LINT_MIN_OPACITY);
}

function lintGet(node, key) {
  if (!(key in node)) return undefined;
  try { return node[key]; } catch (err) { return undefined; }
}

function lintRawPaints(node, key, styleKey) {
  const style = lintGet(node, styleKey);
  const paints = lintGet(node, key);
  if ((typeof style === 'string' && style) || !Array.isArray(paints)) return [];
  return paints.filter((p) => lintShown(p) && p.type === 'SOLID' && !(p.boundVariables && p.boundVariables.color))
    .map((p) => lkColorKey(toHex(p.color), p.opacity));
}

function lintVisible(list) {
  return Array.isArray(list) && list.some(lintShown);
}

// Khung/nhóm chỉ bọc đúng một con cùng kích thước, không có nền/viền/bóng/padding: không thêm gì, gộp được vào con hoặc cha.
// Khung khác kích thước con (ví dụ khung icon 20×20 chứa vector 15×15) là có chủ đích, không báo.
function lintWrapper(node) {
  if (!['FRAME', 'GROUP'].includes(node.type) || ['PAGE', 'SECTION'].includes(node.parent && node.parent.type)) return false;
  const kids = (node.children || []).filter((k) => k.visible !== false);
  if (kids.length !== 1 || Math.abs(kids[0].width - node.width) > 0.5 || Math.abs(kids[0].height - node.height) > 0.5) return false;
  if (lintVisible(lintGet(node, 'fills')) || lintVisible(lintGet(node, 'strokes')) || lintVisible(lintGet(node, 'effects'))) return false;
  return !['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].some((k) => lintGet(node, k));
}

function lintNode(node, push) {
  lintRawPaints(node, 'fills', 'fillStyleId').forEach((hex) => push('raw-fill', node, hex));
  lintRawPaints(node, 'strokes', 'strokeStyleId').forEach((hex) => push('raw-stroke', node, hex));
  if (node.type === 'TEXT') {
    const style = lintGet(node, 'textStyleId');
    const bound = node.boundVariables && (node.boundVariables.fontSize || node.boundVariables.fontFamily);
    if (!(typeof style === 'string' && style) && !bound) {
      const font = node.fontName && !isMixed(node.fontName) ? node.fontName.family + ' ' + node.fontName.style : 'mixed';
      push('no-text-style', node, font + ' ' + (isMixed(node.fontSize) ? 'mixed' : node.fontSize));
    }
  }
  const detached = lintGet(node, 'detachedInfo');
  if (detached) push('detached', node, detached.componentKey || detached.componentId || detached.type || '');
  if (lintWrapper(node)) push('wrapper', node, (node.children[0] || {}).name || '');
}

function lintWalk(node, push) {
  for (const child of node.children || []) {
    if (child.removed || child.visible === false || child.type === 'INSTANCE') continue; // instance: lỗi thuộc component, báo ở component
    lintNode(child, push);
    lintWalk(child, push);
  }
}

async function lintScope(args) {
  if (args.within) return liveNode(args.within);
  if (args.pageId) return liveNode(args.pageId, ['PAGE']);
  return figma.currentPage;
}

// args: { within?: nodeId, pageId?, rules?: [...], limit? }. Mặc định page đang mở. Trả { counts, colors (mã màu thô phổ biến), shown, issues }.
async function liveLint(args) {
  const scope = await lintScope(args);
  const rules = Array.isArray(args.rules) && args.rules.length ? args.rules : LINT_RULES;
  const limit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : LINT_LIMIT;
  const counts = Object.fromEntries(rules.map((r) => [r, 0]));
  const colors = {};
  const issues = [];
  const push = (rule, node, value) => {
    if (!rules.includes(rule)) return;
    counts[rule] += 1;
    if (rule.startsWith('raw-')) colors[value] = (colors[value] || 0) + 1;
    if (issues.length < limit) issues.push({ rule, id: node.id, t: node.type, n: node.name, value, path: findPath(node) });
  };
  if (scope.type !== 'PAGE') lintNode(scope, push);
  if (scope.type !== 'INSTANCE') lintWalk(scope, push);
  const top = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([hex, n]) => ({ hex, n }));
  return { ...liveFile(), readAt: new Date().toISOString(), scope: { id: scope.id, name: scope.name, t: scope.type }, counts, colors: top, shown: issues.length, issues };
}

PLUGIN_COMMANDS.liveLint = liveLint;

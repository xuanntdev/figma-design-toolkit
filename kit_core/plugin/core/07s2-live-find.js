// Tìm node trực tiếp trên Figma trước khi đọc: khớp tên / nội dung chữ / loại / tên component, trong một node, một page hoặc cả file.
// Chỉ trả danh sách gọn có trần, không trả cây (đọc cây bằng liveTree với id tìm được). THUẦN ĐỌC.

const FIND_LIMIT = 50;
const FIND_TEXT_CAP = 120;

// So khớp không phân biệt hoa thường và dấu tiếng Việt ("khao sat" khớp "Khảo sát").
function findNorm(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

function findPath(node) {
  const parts = [];
  for (let n = node.parent; n && n.type !== 'PAGE'; n = n.parent) parts.unshift(n.name);
  return parts.join(' / ');
}

async function findScopes(args) {
  if (args.within) return [await liveNode(args.within)];
  await figma.loadAllPagesAsync();
  return figma.root.children.filter((p) => !args.pageId || p.id === args.pageId);
}

function findMatcher(args) {
  const q = findNorm(args.query);
  const types = Array.isArray(args.types) && args.types.length ? args.types.map((t) => String(t).toUpperCase()) : null;
  return (n) => (!types || types.includes(n.type))
    && (!q || findNorm(n.name).includes(q) || (n.type === 'TEXT' && findNorm(n.characters).includes(q)));
}

async function findComponentName(node) {
  const main = await rsMain(node);
  if (!main) return '';
  return main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent.name + ' / ' + main.name : main.name;
}

async function findRow(node, component) {
  const row = { id: node.id, t: node.type, n: node.name, w: rsRound(node.width || 0), h: rsRound(node.height || 0) };
  row.page = livePage(node).name;
  row.path = findPath(node);
  if (node.type === 'TEXT') row.text = String(node.characters).slice(0, FIND_TEXT_CAP);
  if (node.type === 'INSTANCE') row.component = component || await findComponentName(node);
  const kids = (node.children || []).length;
  if (kids) row.kids = kids;
  return row;
}

// args: { query?, types?: ['TEXT', ...], component?, within?: nodeId, pageId?, limit? }. Trả { total, shown, hits: [...] }.
async function liveFind(args) {
  if (!args.query && !args.types && !args.component) throw new Error('Cần query, types hoặc component để tìm.');
  const limit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : FIND_LIMIT;
  const match = findMatcher(args);
  const want = args.component ? findNorm(args.component) : '';
  const hits = [];
  let total = 0;
  for (const scope of await findScopes(args)) {
    const nodes = typeof scope.findAll === 'function' ? scope.findAll((n) => (want ? n.type === 'INSTANCE' : match(n))) : [];
    for (const node of nodes) {
      const component = want ? await findComponentName(node) : '';
      if (want && (!findNorm(component).includes(want) || !match(node))) continue;
      total += 1;
      if (hits.length < limit) hits.push(await findRow(node, component));
    }
  }
  return { ...liveFile(), readAt: new Date().toISOString(), total, shown: hits.length, hits };
}

PLUGIN_COMMANDS.liveFind = liveFind;

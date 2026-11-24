const LIVE_PROTECTED_KEY = 'designsync.protectedPages';
const LIVE_SCREEN_KEY = 'designsync.screen';

function livePage(node) {
  for (let n = node; n; n = n.parent) if (n.type === 'PAGE') return n;
  return null;
}

function liveProtected() {
  const json = figma.root.getPluginData(LIVE_PROTECTED_KEY);
  return new Set(json ? JSON.parse(json) : []);
}

function liveAssertPage(node) {
  const page = livePage(node);
  if (page && liveProtected().has(page.id)) throw new Error('Page bị cấm ghi: ' + page.name);
}

function liveAssertPages(...nodes) {
  nodes.forEach(liveAssertPage);
}

async function liveNode(id, types) {
  const node = typeof id === 'string' && await figma.getNodeByIdAsync(id);
  if (!node || node.removed || (types && !types.includes(node.type))) throw new Error('Không tìm thấy đích phù hợp: ' + id);
  return node;
}

function liveScreen(node) {
  let frame = null;
  for (let n = node; n && n.type !== 'PAGE'; n = n.parent) {
    if (n.type === 'FRAME' && (stTagOf(n, 'screenId') || stTagOf(n, LIVE_SCREEN_KEY))) return n;
    if (n.type === 'FRAME' && !stTagOf(n, 'role')) frame = n;
  }
  return frame || node;
}

function liveComponent(node) {
  for (let n = node; n && n.type !== 'PAGE'; n = n.parent) {
    if (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') return n;
  }
  return null;
}

function liveScope(node) {
  const page = livePage(node);
  const frame = liveScreen(node);
  return {
    pageId: page.id, page: page.name, frameId: frame.id, screen: frame.name, isScreen: frame.type === 'FRAME',
    screenId: stTagOf(frame, 'screenId') || null, theme: stTagOf(frame, 'theme') || null,
  };
}

function liveFile() {
  return { file: figma.root.name, pageId: figma.currentPage.id };
}

async function liveDescribe(node, depth, ctx) {
  return { ...liveScope(node), nodeId: node.id, tree: await rsNode(node, ctx, depth) };
}

async function liveSelection() {
  const nodes = [...(figma.currentPage.selection || [])];
  const ctx = await rsContext(350);
  return {
    ...liveFile(), readAt: new Date().toISOString(), page: figma.currentPage.name,
    protectedPages: [...liveProtected()],
    selection: await Promise.all(nodes.map((n) => liveDescribe(n, 2, ctx))),
  };
}

async function liveTree(args) {
  const node = await liveNode(args.nodeId);
  if (!livePage(node)) throw new Error('Chọn một node bên trong canvas.');
  const depth = Number.isInteger(args.depth) ? Math.max(0, Math.min(16, args.depth)) : 8;
  const ctx = await rsContext(800);
  return { ...liveFile(), readAt: new Date().toISOString(), node: await liveDescribe(node, depth, ctx) };
}

async function liveProtect(args) {
  assertCanWrite();
  if (typeof args.blocked !== 'boolean') throw new Error('Trạng thái cấm ghi phải là true hoặc false.');
  const page = await liveNode(args.pageId, ['PAGE']);
  const blocked = liveProtected();
  if (args.blocked !== blocked.has(page.id)) {
    if (args.blocked) blocked.add(page.id);
    else blocked.delete(page.id);
    figma.root.setPluginData(LIVE_PROTECTED_KEY, JSON.stringify([...blocked]));
    LOCAL_LAST_BATCH = null;
    figma.commitUndo();
  }
  return { pageId: page.id, page: page.name, blocked: args.blocked };
}

async function liveImpact(args) {
  if (args.variableId) {
    const variable = await liveVariable(args.variableId);
    return { variable: variable.name, inherited: await liveVariableImpact([variable.id]) };
  }
  const node = await liveNode(args.nodeId);
  const instances = await liveComponentImpact([{ node }]);
  const inherited = new Map(instances.map(({ scope }) => [scope.frameId, scope]));
  return { target: liveScope(node), inherited: [...inherited.values()], instances };
}

Object.assign(PLUGIN_COMMANDS, { liveFile, liveSelection, liveTree, liveProtect, liveImpact });

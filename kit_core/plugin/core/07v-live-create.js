const LIVE_CREATE_TYPES = {
  FRAME: () => figma.createFrame(), TEXT: () => figma.createText(),
  RECTANGLE: () => figma.createRectangle(), ELLIPSE: () => figma.createEllipse(),
  SVG: (spec) => figma.createNodeFromSvg(spec.svg), IMAGE: () => figma.createRectangle(),
};

function liveCreateCheck(spec, budget, depth) {
  if (!liveRecord(spec) || budget.left-- <= 0 || depth > 20) throw new Error('Cây layer vượt giới hạn.');
  if (!Object.hasOwn(LIVE_CREATE_TYPES, spec.type) && spec.type !== 'INSTANCE') throw new Error('Loại layer chưa hỗ trợ: ' + spec.type);
  if (spec.type === 'SVG' && (typeof spec.svg !== 'string' || spec.svg.length > 500000 || !/<svg[\s>]/i.test(spec.svg))) {
    throw new Error('SVG cần mã vector hợp lệ.');
  }
  if (spec.type === 'IMAGE' && (typeof spec.base64 !== 'string' || !spec.base64 || spec.base64.length > 8000000)) {
    throw new Error('IMAGE cần dữ liệu base64 của ảnh thành phần.');
  }
  if (spec.children != null) {
    if (spec.type !== 'FRAME' || !Array.isArray(spec.children)) throw new Error('Chỉ frame có thể nhận danh sách layer con.');
    spec.children.forEach((node) => liveCreateCheck(node, budget, depth + 1));
  }
}

function liveAssertCreatePage(page) {
  if (figma.currentPage.id !== page.id) throw new Error('Page đang mở đã đổi trong lúc dựng. Thử lại.');
  liveAssertPage(page);
}

async function liveAssignCreated(node, set) {
  if (set == null || (liveRecord(set) && !Object.keys(set).length)) return;
  for (const step of await liveSteps(node, set)) await step.apply(step.after);
}

async function liveCreateLayer(spec, parent, page, created) {
  const component = spec.type === 'INSTANCE' ? await liveNode(spec.componentId, ['COMPONENT']) : null;
  liveAssertCreatePage(page);
  const node = component ? component.createInstance() : LIVE_CREATE_TYPES[spec.type](spec);
  created.push(node);
  parent.appendChild(node);
  if (spec.set?.layoutMode) {
    node.layoutMode = spec.set.layoutMode;
    const { layoutMode, ...rest } = spec.set;
    await liveAssignCreated(node, rest);
  } else {
    await liveAssignCreated(node, spec.set);
  }
  if (spec.type === 'IMAGE') {
    const image = figma.createImage(figma.base64Decode(spec.base64));
    node.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
  }
  for (const child of spec.children || []) await liveCreateLayer(child, node, page, created);
  return node;
}

function liveCloneChild(root, path) {
  if (!Array.isArray(path) || path.length > 20) throw new Error('path cần là mảng chỉ số layer.');
  let node = root;
  for (const index of path) {
    node = Number.isInteger(index) && index >= 0 && node.children?.[index];
    if (!node) throw new Error('Không tìm thấy layer trong bản sao: ' + path.join('/'));
  }
  return node;
}

async function liveCloneFrame(args, parent, page, created) {
  const source = await liveNode(args.cloneFrom, ['FRAME']);
  await livePage(source).loadAsync();
  const overrides = args.overrides ?? [];
  if (!Array.isArray(overrides) || overrides.length > 500) throw new Error('Danh sách override không hợp lệ.');
  liveAssertCreatePage(page);
  const frame = source.clone();
  created.push(frame);
  parent.appendChild(frame);
  await liveAssignCreated(frame, args.set);
  for (const item of overrides) {
    const child = liveCloneChild(frame, item.path);
    if (item.expectName && item.expectName !== child.name) throw new Error('Layer trong màn nguồn đã đổi: ' + item.expectName);
    await liveAssignCreated(child, item.set);
  }
  return frame;
}

function livePlaceScreen(frame, parent, set) {
  const peers = parent.children.filter((node) => node !== frame && typeof node.width === 'number');
  if (parent.type === 'FRAME' && parent.layoutMode !== 'NONE') return;
  if (!('x' in (set || {}))) frame.x = peers.length ? Math.max(...peers.map((n) => n.x + n.width)) + 80 : 0;
  if (!('y' in (set || {}))) frame.y = peers.length ? Math.min(...peers.map((n) => n.y)) : 0;
}

async function liveCreate(args) {
  assertCanWrite();
  if (typeof args.name !== 'string' || !args.name.trim() || args.name.length > 300) throw new Error('Cần tên màn.');
  const parent = await liveNode(args.parentId, ['PAGE', 'SECTION', 'FRAME']);
  const page = livePage(parent);
  liveAssertPage(page);
  const spec = { type: 'FRAME', set: args.set, children: args.children };
  if (!args.cloneFrom) liveCreateCheck(spec, { left: 600 }, 0);
  const created = [];
  try {
    await page.loadAsync();
    if (figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page);
    const frame = args.cloneFrom ? await liveCloneFrame(args, parent, page, created) : await liveCreateLayer(spec, parent, page, created);
    liveAssertCreatePage(page);
    frame.name = args.name.trim();
    for (const key of ['screenId', 'role', 'status', 'fp', 'srcHash', 'buildHash', 'batchId', 'variant', 'conflict', 'conflictOf', 'edited']) {
      frame.setPluginData(key, '');
    }
    stTag(frame, { source: 'human', [LIVE_SCREEN_KEY]: '1' });
    livePlaceScreen(frame, parent, args.set);
    liveCommit();
    return { nodeId: frame.id, ...liveScope(frame) };
  } catch (error) {
    await liveRollback(created.map((node) => () => { if (!node.removed) node.remove(); }), error);
  }
}

PLUGIN_COMMANDS.liveCreate = liveCreate;

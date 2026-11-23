// Lệnh lõi chạy cục bộ trong Figma Desktop (không cầu nối, không eval từ mạng).

async function resolveNodes(args) {
  if (args.nodeId) {
    const n = await figma.getNodeByIdAsync(args.nodeId);
    if (!n) throw new Error('Không tìm thấy layer ' + args.nodeId + '.');
    return [n];
  }
  return figma.currentPage.selection.slice();
}

async function cmdListPages(args) {
  if (args.pageId) {
    const page = await figma.getNodeByIdAsync(args.pageId);
    if (!page || page.type !== 'PAGE') throw new Error('Không tìm thấy trang ' + args.pageId + '.');
    await page.loadAsync();
  } else {
    await figma.loadAllPagesAsync();
  }
  const limit = args.maxFrames || 200;
  const pages = figma.root.children.filter((p) => !args.pageId || p.id === args.pageId);
  return {
    pages: pages.map((p) => ({
      id: p.id,
      name: p.name,
      childCount: p.children.length,
      frames: p.children.slice(0, limit).map((c) => ({
        id: c.id, name: c.name, type: c.type, width: c.width, height: c.height,
      })),
      truncated: p.children.length > limit,
    })),
  };
}

async function cmdReadTree(args) {
  const nodes = await resolveNodes(args);
  const budget = { left: args.maxNodes || 2000 };
  const depth = args.depth == null ? 6 : args.depth;
  return { nodes: nodes.map((n) => serializeNode(n, depth, budget)), truncated: budget.left <= 0 };
}

async function cmdExportPng(args) {
  const nodes = await resolveNodes(args);
  if (nodes.length !== 1) throw new Error('Hãy chọn đúng một khung hoặc truyền nodeId khi xuất PNG.');
  const node = nodes[0];
  const scale = args.scale || 1;
  const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
  return {
    nodeId: node.id, name: node.name, width: node.width, height: node.height,
    scale, base64: figma.base64Encode(bytes),
  };
}

const PLUGIN_COMMANDS = {
  getCatalog: async () => localCatalog(),
  updateDraft: cmdUpdateDraft,
  rollbackDraft: cmdRollbackDraft,
  ensureLayout: cmdEnsureLayout,
  buildImproved: cmdBuildImproved,
  currentPlan: cmdCurrentPlan,
  currentApply: cmdCurrentApply,
  listPages: cmdListPages,
  readTree: cmdReadTree,
  exportPng: cmdExportPng,
};

function prototypeActions(reaction) {
  return reaction.actions || (reaction.action ? [reaction.action] : []);
}

function prototypeSources(targets) {
  const screenIds = new Set(targets.map((target) => target.screen.id));
  const pages = figma.root.children.filter((page) => typeof page.findAll === 'function');
  const destinations = new Set(pages.flatMap((page) => page.findAll((node) => (
    node.type === 'FRAME' && screenIds.has(stTagOf(node, 'screenId'))
  )).map((node) => node.id)));
  if (!destinations.size) return [];
  const sources = [];
  for (const page of pages) {
    const nodes = page.findAll((node) => typeof node.setReactionsAsync === 'function' && (node.reactions || []).some((reaction) => (
      prototypeActions(reaction).some((action) => action.type === 'NODE' && destinations.has(action.destinationId))
    )));
    for (const node of nodes) {
      sources.push({ node, reactions: JSON.parse(JSON.stringify(node.reactions)), page: page.name, layer: node.name });
    }
  }
  return sources;
}

function prototypeRetarget(reaction, destinations) {
  const actions = prototypeActions(reaction).map((action) => (
    action.type === 'NODE' && destinations.has(action.destinationId)
      ? { ...action, destinationId: destinations.get(action.destinationId) }
      : action
  ));
  return { trigger: reaction.trigger, actions };
}

async function prototypeRestore(sources, proposals) {
  const destinations = new Map(proposals.flatMap((row) => (row.replacedIds || []).map((id) => [id, row.frameId])));
  const result = { links: 0, issues: [], pageIds: [] };
  if (!destinations.size) return result;
  for (const { node, reactions, page, layer } of sources) {
    if (node.removed) continue;
    const actions = reactions.flatMap(prototypeActions);
    const changed = actions.filter((action) => action.type === 'NODE' && destinations.has(action.destinationId));
    if (!changed.length) continue;
    try {
      liveAssertPage(node);
      await node.setReactionsAsync(reactions.map((reaction) => prototypeRetarget(reaction, destinations)));
      result.links += changed.length;
      result.pageIds.push(livePage(node).id);
    } catch (error) {
      result.issues.push(page + ' · ' + layer + ': ' + (error?.message || 'Không thể nối lại prototype.'));
    }
  }
  return result;
}

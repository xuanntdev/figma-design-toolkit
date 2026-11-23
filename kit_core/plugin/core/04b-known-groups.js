// Groups to lay out in a container: those of this build plus groups built earlier (a partial build, e.g. only some
// groups embedded, must not drop the labels or overlap the cells of groups it does not carry).
// Frames built in container mode are tagged groupId / groupTitle / groupOrder so these groups can be rebuilt.
// The newest { order, title } of a group comes from the extension (embedded groups) or DRAFT_PLAN.groupOrders (every
// captured group, embedded or not); the tags are refreshed from it so a renumbered menu reorders old builds too.

function stGroupTags(group) {
  return { groupId: group.id, groupTitle: group.title, groupOrder: group.order == null ? '' : group.order };
}

// Latest { order, title } of a group id, or null when nothing recognises it (its own tags are then kept).
function stGroupMeta(id) {
  const own = stGroups().find((g) => g.id === id);
  if (own) return { order: own.order, title: own.title };
  const plan = typeof DRAFT_PLAN !== 'undefined' && DRAFT_PLAN;
  const m = plan && plan.groupOrders && plan.groupOrders[id];
  return m || null;
}

// Rewrites groupOrder/groupTitle on a tagged node from the latest meta; returns the meta (or null).
function stRetagGroup(node) {
  const id = stTagOf(node, 'groupId');
  const meta = id ? stGroupMeta(id) : null;
  if (meta) stTag(node, stGroupTags({ id, title: meta.title, order: meta.order }));
  return meta;
}

function stEarlierGroups(containers, known) {
  const extra = {};
  const nodes = containers.flatMap((c) => c.children.filter((n) => stTagOf(n, 'groupId') && stTagOf(n, 'screenId')));
  nodes.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const n of nodes) {
    const id = stTagOf(n, 'groupId');
    stRetagGroup(n);
    if (known.has(id)) continue;
    const order = stTagOf(n, 'groupOrder');
    const g = extra[id] || (extra[id] = { id, title: stTagOf(n, 'groupTitle') || id, order: order === '' ? undefined : Number(order), screens: [] });
    const stem = stTagOf(n, 'screenId');
    if (!g.screens.some((s) => s.stem === stem)) g.screens.push({ stem });
  }
  return Object.keys(extra).map((id) => extra[id]);
}

// Menu order: ascending `order`, groups without one last (ties by id when ordered, else keep given order).
function stSortGroups(groups) {
  const key = (g) => (typeof g.order === 'number' ? g.order : Infinity);
  const byId = (a, b) => (a.id < b.id ? -1 : 1);
  return groups.sort((a, b) => {
    if (key(a) === key(b)) return key(a) === Infinity ? 0 : byId(a, b);
    return key(a) < key(b) ? -1 : 1;
  });
}

function stLayoutGroups(containers) {
  const own = stGroups();
  const all = own.concat(stEarlierGroups(containers, new Set(own.map((g) => g.id))));
  return stSortGroups(all);
}

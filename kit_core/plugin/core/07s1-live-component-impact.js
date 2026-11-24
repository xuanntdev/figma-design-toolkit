function liveChangedFields({ key, before, after }) {
  if (key === 'size') return ['width', 'height'].filter((field) => before[field] !== after[field]);
  if (key === 'bindings') return Object.keys(after).filter((field) => before[field] !== after[field]);
  return liveEqual(before, after) ? [] : [key];
}

function liveInstanceLayerId(instance, main, node) {
  if (node.id === main.id) return instance.id;
  // A copied layer ID consists of its instance prefix and the source layer's ID path.
  const prefix = instance.id.startsWith('I') ? instance.id : 'I' + instance.id;
  return prefix + ';' + node.id.replace(/^I/, '');
}

function liveLayerOverrides(instance, main, node) {
  const id = liveInstanceLayerId(instance, main, node);
  const fields = new Set();
  // An outer instance can own a direct override on a layer inside a nested instance.
  for (let owner = instance; owner && owner.type !== 'PAGE'; owner = owner.parent) {
    if (owner.type !== 'INSTANCE') continue;
    for (const override of owner.overrides || []) {
      if (override.id !== id && !(owner === instance && override.id === node.id)) continue;
      for (const field of override.overriddenFields) fields.add(field);
    }
  }
  return fields;
}

async function liveSourceInstances(instance, main, cache) {
  const path = instance.id.split(';').slice(1);
  const results = [];
  for (let i = 0; i < path.length; i += 1) {
    const id = path.slice(i).join(';');
    const sourceId = i === path.length - 1 ? id : 'I' + id;
    if (!cache.has(sourceId)) {
      const source = await figma.getNodeByIdAsync(sourceId);
      cache.set(sourceId, source?.type === 'INSTANCE' ? { source, main: await source.getMainComponentAsync() } : null);
    }
    const match = cache.get(sourceId);
    if (match?.main?.id === main.id) results.push(match.source);
  }
  return results;
}

function liveInstanceEffect(instance, main, sources, { node, fields }) {
  const overrides = liveLayerOverrides(instance, main, node);
  for (const source of sources) {
    for (const field of liveLayerOverrides(source, main, node)) overrides.add(field);
  }
  const effect = { nodeId: node.id, layer: node.name, inherited: [], overridden: [], uncertain: [] };
  if (!fields) {
    effect.overridden = [...overrides].sort();
    return effect;
  }
  for (const field of fields) {
    // Figma exposes direct layer overrides. Component properties can also supply the effective value.
    if (field === 'componentProperties' || node.type === 'COMPONENT_SET') effect.uncertain.push(field);
    else if (overrides.has(field)) effect.overridden.push(field);
    else if (node.componentPropertyReferences?.[field] || (field === 'characters' && overrides.has('text'))) {
      effect.uncertain.push(field);
    } else effect.inherited.push(field);
  }
  return effect;
}

async function liveComponentImpact(targets) {
  const byComponent = new Map();
  for (const target of targets) {
    const component = liveComponent(target.node);
    if (!component || target.fields?.length === 0) continue;
    if (!byComponent.has(component.id)) byComponent.set(component.id, []);
    byComponent.get(component.id).push(target);
  }
  if (!byComponent.size) return [];
  await figma.loadAllPagesAsync();
  const results = [];
  const sources = new Map();
  for (const page of figma.root.children) {
    for (const instance of page.findAllWithCriteria({ types: ['INSTANCE'] })) {
      const main = await instance.getMainComponentAsync();
      if (!main) continue;
      const matched = [...(byComponent.get(main.id) || []), ...(byComponent.get(main.parent?.id) || [])];
      if (!matched.length) continue;
      const sourceInstances = await liveSourceInstances(instance, main, sources);
      results.push({
        scope: liveScope(instance), instanceId: instance.id, instance: instance.name,
        effects: matched.map((target) => liveInstanceEffect(instance, main, sourceInstances, target)),
      });
    }
  }
  return results.sort((a, b) => a.instanceId.localeCompare(b.instanceId));
}

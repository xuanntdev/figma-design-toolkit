function liveHasAlias(value, ids) {
  if (Array.isArray(value)) return value.some((child) => liveHasAlias(child, ids));
  if (!liveRecord(value)) return false;
  if (value.type === 'VARIABLE_ALIAS') return ids.has(value.id);
  return Object.values(value).some((child) => liveHasAlias(child, ids));
}

async function liveAliasClosure(ids) {
  const all = await figma.variables.getLocalVariablesAsync();
  const affected = new Set(ids);
  let size;
  do {
    size = affected.size;
    for (const variable of all) {
      if (liveHasAlias(variable.valuesByMode, affected)) affected.add(variable.id);
    }
  } while (size !== affected.size);
  return affected;
}

async function liveBoundStyles(ids) {
  const styles = await Promise.all([
    figma.getLocalTextStylesAsync?.() || [], figma.getLocalPaintStylesAsync?.() || [], figma.getLocalEffectStylesAsync?.() || [],
  ]);
  return new Set(styles.flat().filter((item) => liveHasAlias([
    item.boundVariables, item.paints, item.effects,
  ], ids)).map((item) => item.id));
}

async function liveVariableImpact(ids) {
  if (!ids.length) return [];
  const affected = await liveAliasClosure(ids);
  const styleIds = await liveBoundStyles(affected);
  const scopes = new Map();
  await figma.loadAllPagesAsync();
  for (const page of figma.root.children) {
    const nodes = page.findAll((node) => liveHasAlias(node.boundVariables, affected)
      || [node.fillStyleId, node.strokeStyleId, node.textStyleId, node.effectStyleId].some((id) => styleIds.has(id)));
    for (const node of nodes) {
      const scope = liveScope(node);
      scopes.set(scope.frameId, scope);
    }
  }
  return [...scopes.values()];
}

function liveVariableValue(type, input) {
  if (type === 'COLOR' && typeof input === 'string' && /^#[a-fA-F0-9]{6}$/.test(input)) return { ...stSolid(input)[0].color, a: 1 };
  if (type === 'BOOLEAN' && typeof input === 'boolean') return input;
  if (type === 'STRING' && typeof input === 'string') return input;
  if (type === 'FLOAT' && Number.isFinite(input)) return input;
  throw new Error('Giá trị chưa phù hợp kiểu biến ' + type + '.');
}

async function liveVariableRow(edit) {
  const variable = await liveVariable(edit.variableId);
  const values = variable.valuesByMode;
  if (variable.remote || !Object.hasOwn(values, edit.modeId)) throw new Error('Chọn một mode của biến cục bộ.');
  const before = values[edit.modeId];
  const after = liveVariableValue(variable.resolvedType, edit.value);
  const steps = [{ key: 'value', before, after, apply: (v) => variable.setValueForMode(edit.modeId, v) }];
  liveCheckExpected(edit, steps);
  return {
    node: null, variableId: variable.id, name: variable.name, steps,
    scope: { pageId: null, page: 'Biến Figma', frameId: variable.id, screen: variable.name },
  };
}

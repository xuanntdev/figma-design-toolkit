// Project settings baked in by `design_sync.py build` from design-sync.json (empty when built without one).
// Every option defaults to the behaviour of the original kit, so a project opts in to each advanced feature:
//   layout        'grid' (containers / mirrored Sections) | 'sections' (Section tree, for the "current" side)
//   sectionLevels which Section levels the tree has: any ordered subset of ['area', 'group', 'flow']
//   collapseSingleFlow / sectionFills   the tree's flow level folds into its group when only one flow; fill per level
//   screenLabels  false (nothing) | 'name' (layer name `code · title`) | true (layer name + text labels over the frame)
//   sync          'replace' (rebuild unprotected drafts) | 'merge' (3-way per screen, keep hand edits, conflicts)
//   preview       true = "Cập nhật" first shows a table and writes only after "Áp dụng"
//   cleanup       true = each update removes the "Cải tiến" side (improved=false) and themes outside DRAFT_PLAN.themes
//   tokens        'off' | 'button' (Token button only) | 'update' (also refresh the Token page on every update)
//   sortGroups    true = groups laid out by their `order` (default: as the extension lists them)
function stConfig() {
  return (typeof DESIGN_CONFIG !== 'undefined' && DESIGN_CONFIG) || {};
}

const ST_FILLS = { area: null, group: '#DCEAFB', flow: '#EEF5FE' };
const ST_LEVELS = ['area', 'group', 'flow'];

function stSetting(key, fallback) {
  const v = stConfig()[key];
  return v === undefined ? fallback : v;
}

function stLayoutTree() {
  return stSetting('layout', 'grid') === 'sections';
}

function stSyncMerge() {
  return stSetting('sync', 'replace') === 'merge';
}

function stPreviewOn() {
  return stSetting('preview', false) === true;
}

function stCleanupOn() {
  return stSetting('cleanup', false) === true;
}

function stSortOn() {
  return stSetting('sortGroups', false) === true;
}

function stTokensMode() {
  return stSetting('tokens', 'button');
}

// false | 'name' | 'text'
function stLabelMode() {
  const v = stSetting('screenLabels', false);
  return v === true ? 'text' : (v === 'name' ? 'name' : false);
}

function stTreeLevels() {
  const levels = stSetting('sectionLevels', ST_LEVELS);
  return ST_LEVELS.filter((l) => levels.includes(l));
}

function stTreeFills() {
  return Object.assign({}, ST_FILLS, stSetting('sectionFills', {}));
}

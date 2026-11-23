// Grid layout shared by the "current" and "proposed" containers (pure functions, no Figma calls).
// The same input (screen groups, columns per screen) gives the same relative coordinates, so a screen's cell
// lines up horizontally between the two containers.
// Project settings baked in by `design_sync.py build` from design-sync.json (empty when built without one).
function stConfig() {
  return (typeof DESIGN_CONFIG !== 'undefined' && DESIGN_CONFIG) || {};
}

const ST_FRAME = stConfig().frame || { width: 393, height: 873, perRow: 6 };

const ST_GRID = {
  cellW: ST_FRAME.width,
  cellH: ST_FRAME.height,
  gapX: 48,
  gapY: 96,
  perRow: ST_FRAME.perRow || 6,
  pad: 80,
  headerH: 150,
  titleH: 64,
  groupGap: 120,
  regionGap: 240,
  containerGap: 320,
};

function stKey(theme, screenId) {
  return theme + ':' + screenId;
}

// Columns a screen occupies: at least 1 (several proposals take several columns), at most one row.
function stSpan(slots, screenId) {
  return Math.min(ST_GRID.perRow, Math.max(1, (slots && slots[screenId]) || 1));
}

function stPlaceGroup(group, theme, top, slots, cells) {
  let x = ST_GRID.pad;
  let y = top;
  let used = 0;
  for (const s of group.screens) {
    const span = stSpan(slots, s.stem);
    if (used > 0 && used + span > ST_GRID.perRow) {
      x = ST_GRID.pad;
      y += ST_GRID.cellH + ST_GRID.gapY;
      used = 0;
    }
    cells[stKey(theme, s.stem)] = { x, y, span, theme, screenId: s.stem };
    x += span * (ST_GRID.cellW + ST_GRID.gapX);
    used += span;
  }
  return y + ST_GRID.cellH;
}

// groups: [{ id, title, screens: [{ stem }] }]; slots: { [screenId]: columns }; themes: ['light', 'dark'].
function stComputeLayout(groups, slots, themes) {
  const cells = {};
  const labels = [];
  let y = ST_GRID.pad + ST_GRID.headerH;
  for (const theme of themes) {
    for (const g of groups) {
      labels.push({ theme, groupId: g.id, title: g.title, x: ST_GRID.pad, y });
      y = stPlaceGroup(g, theme, y + ST_GRID.titleH, slots, cells) + ST_GRID.groupGap;
    }
    y += ST_GRID.regionGap - ST_GRID.groupGap;
  }
  const width = ST_GRID.pad * 2 + ST_GRID.perRow * ST_GRID.cellW + (ST_GRID.perRow - 1) * ST_GRID.gapX;
  return { width, height: y + ST_GRID.pad, cells, labels };
}

// X position of the column holding proposal number `variant` (0, 1, ...) of a cell.
function stVariantX(cell, variant) {
  return cell.x + variant * (ST_GRID.cellW + ST_GRID.gapX);
}

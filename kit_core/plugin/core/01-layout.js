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
  // Chỗ chừa phía trên mỗi khung cho nhãn tên màn (design-sync.json `screenLabels: false` để tắt).
  labelH: stConfig().screenLabels === false ? 0 : 88,
};

function stKey(theme, screenId) {
  return theme + ':' + screenId;
}

// Columns a screen occupies: at least 1 (several proposals take several columns), at most one row.
function stSpan(slots, screenId) {
  return Math.min(ST_GRID.perRow, Math.max(1, (slots && slots[screenId]) || 1));
}

// Cells wrap to a new row after `perRow` columns; a row is as tall as its tallest cell (heights[key], else cellH).
// Each row keeps `labelH` free above it for the screen name labels.
function stPlaceGroup(group, theme, top, slots, cells, heights) {
  const lh = ST_GRID.labelH;
  let x = ST_GRID.pad;
  let y = top + lh;
  let used = 0;
  let rowH = 0;
  for (const s of group.screens) {
    const span = stSpan(slots, s.stem);
    const h = heights[stKey(theme, s.stem)] || ST_GRID.cellH;
    if (used > 0 && used + span > ST_GRID.perRow) {
      x = ST_GRID.pad;
      y += rowH + ST_GRID.gapY + lh;
      used = 0;
      rowH = 0;
    }
    cells[stKey(theme, s.stem)] = { x, y, span, theme, screenId: s.stem, h };
    x += span * (ST_GRID.cellW + ST_GRID.gapX);
    used += span;
    rowH = Math.max(rowH, h);
  }
  return y + rowH;
}

// Flow boxes [{ w, h }] into rows of `perRow` starting at (x0, y0): { points: [{ x, y }], bottom }.
function stFlowRows(sizes, perRow, gapX, gapY, x0, y0) {
  const points = [];
  let x = x0;
  let y = y0;
  let rowH = 0;
  sizes.forEach((b, i) => {
    if (i > 0 && i % perRow === 0) {
      x = x0;
      y += rowH + gapY;
      rowH = 0;
    }
    points.push({ x, y });
    x += b.w + gapX;
    rowH = Math.max(rowH, b.h);
  });
  return { points, bottom: y + rowH };
}

// groups: [{ id, title, screens: [{ stem }] }]; slots: { [screenId]: columns }; themes: ['light', 'dark'];
// heights: { [theme:screenId]: real frame height } (default cellH).
function stComputeLayout(groups, slots, themes, heights) {
  const cells = {};
  const labels = [];
  let y = ST_GRID.pad + ST_GRID.headerH;
  for (const theme of themes) {
    for (const g of groups) {
      labels.push({ theme, groupId: g.id, title: g.title, x: ST_GRID.pad, y });
      y = stPlaceGroup(g, theme, y + ST_GRID.titleH, slots, cells, heights || {}) + ST_GRID.groupGap;
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

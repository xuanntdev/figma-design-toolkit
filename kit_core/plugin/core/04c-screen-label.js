// Tên màn trên canvas: mỗi khung màn có tên layer `<mã> · <title>` và 2 text node nhãn nằm ngay phía trên khung
// (dòng 1 `<mã> · <title>`, dòng 2 nhỏ màu xám = stem). Nhãn gắn plugin data { role: screenLabel, labelFor: id khung,
// labelScreen, theme, part } nên lượt Cập nhật sau thay đúng nhãn đó, không nhân đôi. Mã = `<order nhóm>.<số thứ tự
// trong nhóm, 2 chữ số>` tính từ chính group.json của nhóm nên không đổi dù build lô nhóm nào.

const ST_LABEL = { titleSize: 28, stemSize: 18, inner: 6, gap: 14, titleColor: '#141A24', stemColor: '#8A94A6' };

function stScreenCode(group, screen) {
  if (screen.code) return screen.code;
  if (!group || group.order == null) return '';
  const stem = screen.stem || screen.id;
  const i = group.screens.findIndex((s) => (s.stem || s.id) === stem);
  return i < 0 ? '' : group.order + '.' + (i < 9 ? '0' : '') + (i + 1);
}

function stScreenText(group, screen) {
  const code = stScreenCode(group, screen);
  return code ? code + ' · ' + screen.title : screen.title;
}

// Chỉ đặt hậu tố chủ đề khi dự án có hơn 1 chủ đề.
function stProjectThemes(plan) {
  if (typeof DRAFT_PLAN !== 'undefined' && DRAFT_PLAN && DRAFT_PLAN.themes) return DRAFT_PLAN.themes;
  return (plan && plan.themes) || ['light', 'dark'];
}

function stScreenInfo(group, screen, theme, themes) {
  const text = stScreenText(group, screen);
  const suffix = themes && themes.length > 1 ? ' · ' + theme : '';
  return { name: text + suffix, text, stem: screen.stem || screen.id, screenId: screen.stem || screen.id, theme };
}

function stLabelsOf(parent, frame) {
  return parent.children.filter((n) => n.type === 'TEXT' && stTagOf(n, 'role') === 'screenLabel' && stTagOf(n, 'labelFor') === frame.id);
}

function stDropLabels(parent, frame) {
  stLabelsOf(parent, frame).forEach((n) => n.remove());
}

// Xóa nhãn mồ côi (khung đã bị xóa) của đúng màn + chủ đề.
function stSweepLabels(parent, id, theme) {
  const alive = new Set(parent.children.filter((n) => n.type === 'FRAME').map((n) => n.id));
  for (const n of parent.children.slice()) {
    if (stTagOf(n, 'role') !== 'screenLabel' || stTagOf(n, 'labelScreen') !== id) continue;
    if ((stTagOf(n, 'theme') || 'light') === theme && !alive.has(stTagOf(n, 'labelFor'))) n.remove();
  }
}

// Khung dựng bằng bản cũ có tên `screenId · theme` (hoặc `screenId`) mà mất tag: nhận lại như bản nháp ai.
function stAdoptLegacy(parent, id, theme) {
  const names = [id + ' · ' + theme, id];
  for (const n of parent.children) {
    if (n.type === 'FRAME' && !stTagOf(n, 'screenId') && names.includes(n.name)) {
      stTag(n, { screenId: id, theme, source: 'ai', status: 'draft' });
    }
  }
}

// Đặt nhãn sát phía trên khung (đáy nhãn cách khung `gap`).
function stPlaceLabels(parent, frame) {
  const ls = stLabelsOf(parent, frame);
  const title = ls.find((n) => stTagOf(n, 'part') === 'title');
  const stem = ls.find((n) => stTagOf(n, 'part') === 'stem');
  if (title && stem) {
    title.x = frame.x;
    stem.x = frame.x;
    stem.y = frame.y - ST_LABEL.gap - stem.height;
    title.y = stem.y - ST_LABEL.inner - title.height;
  }
  cfPlaceLabel(parent, frame);
}

// Đặt tên layer + (tạo lại) nhãn của một khung; nhãn thuộc cùng cha với khung.
function stSetScreenLabel(parent, frame, info) {
  frame.name = info.name;
  stDropLabels(parent, frame);
  if (!ST_GRID.labelH) return;
  const parts = [['title', info.text, ST_LABEL.titleSize, 'Semi Bold', ST_LABEL.titleColor], ['stem', info.stem, ST_LABEL.stemSize, 'Regular', ST_LABEL.stemColor]];
  for (const [part, str, size, weight, color] of parts) {
    const t = stText(parent, str, size, weight, color, frame.x, frame.y, frame.width);
    stTag(t, { role: 'screenLabel', labelFor: frame.id, labelScreen: info.screenId, theme: info.theme, part });
  }
  stPlaceLabels(parent, frame);
}

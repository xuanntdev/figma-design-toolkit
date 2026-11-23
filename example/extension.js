// Extension mẫu của Design Sync Toolkit (2 màn Sáng/Tối dùng Auto Layout chỉnh sửa trực tiếp trên Figma).

function sampleCard(parent, title, subtitle, pal) {
  const card = figma.createFrame();
  card.name = 'Card/' + title;
  card.layoutMode = 'VERTICAL';
  card.itemSpacing = 6;
  card.paddingTop = 16;
  card.paddingBottom = 16;
  card.paddingLeft = 16;
  card.paddingRight = 16;
  card.cornerRadius = 18;
  card.fills = stSolid(pal.surface);
  card.strokes = stSolid(pal.line);
  card.strokeWeight = 1;
  parent.appendChild(card);
  card.layoutSizingHorizontal = 'FILL';

  const t = stText(card, title, 16, 'Semi Bold', pal.ink, 0, 0);
  t.layoutSizingHorizontal = 'FILL';
  const sub = stText(card, subtitle, 13, 'Regular', pal.muted, 0, 0);
  sub.layoutSizingHorizontal = 'FILL';
}

function sampleButton(parent, label, pal) {
  const btn = figma.createFrame();
  btn.name = 'Button/' + label;
  btn.layoutMode = 'HORIZONTAL';
  btn.primaryAxisAlignItems = 'CENTER';
  btn.counterAxisAlignItems = 'CENTER';
  btn.resize(ST_GRID.cellW - 48, 48);
  btn.cornerRadius = 999;
  btn.fills = stSolid(pal.accent);
  parent.appendChild(btn);
  btn.layoutSizingHorizontal = 'FILL';
  stText(btn, label, 15, 'Semi Bold', '#FFFFFF', 0, 0);
}

function sampleBuildScreen(screen, theme) {
  const dark = theme === 'dark';
  const pal = dark
    ? { bg: '#131313', surface: '#242424', line: '#333333', ink: '#EDEDED', muted: '#B4B4B4', accent: '#2563EB' }
    : { bg: '#FFFFFF', surface: '#F5F8FF', line: '#E6EAF0', ink: '#141A24', muted: '#4B5567', accent: '#2563EB' };
  const frame = figma.createFrame();
  frame.name = screen.title + (dark ? ' · Tối' : ' · Sáng');
  frame.layoutMode = 'VERTICAL';
  frame.itemSpacing = 14;
  frame.paddingTop = 56;
  frame.paddingBottom = 24;
  frame.paddingLeft = 24;
  frame.paddingRight = 24;
  frame.resize(ST_GRID.cellW, ST_GRID.cellH); // cỡ khung lấy từ design-sync.json (mặc định 393×873)
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';
  frame.cornerRadius = 36;
  frame.clipsContent = true;
  frame.fills = stSolid(pal.bg);
  frame.strokes = stSolid(pal.line);

  const heading = stText(frame, screen.title, 26, 'Semi Bold', pal.ink, 0, 0);
  heading.layoutSizingHorizontal = 'FILL';
  const desc = stText(frame, screen.desc, 14, 'Regular', pal.muted, 0, 0);
  desc.layoutSizingHorizontal = 'FILL';
  sampleCard(frame, 'Auto Layout sẵn sàng', 'Chữ, khoảng cách và thẻ đều sửa trực tiếp được trong Figma.', pal);
  sampleCard(frame, 'Bảo toàn bản đã duyệt', 'Các khung gắn status=chosen hoặc source=human không bị ghi đè.', pal);
  sampleButton(frame, screen.cta, pal);
  return frame;
}

const DESIGN_EXTENSION = {
  groups: [
    {
      id: 'getting-started',
      title: '1 · Bắt đầu',
      screens: [
        { stem: 'welcome', title: 'Chào mừng', desc: 'Màn mẫu khởi đầu của Design Sync Toolkit (Sáng & Tối).', cta: 'Bắt đầu ngay' },
      ],
    },
  ],
  prepare: async () => {
    for (const style of ['Regular', 'Medium', 'Semi Bold']) {
      await figma.loadFontAsync({ family: 'Inter', style });
    }
  },
  build: (screen, theme) => sampleBuildScreen(screen, theme),
};

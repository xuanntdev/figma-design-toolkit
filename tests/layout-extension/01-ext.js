// Extension thử bố cục: khung rộng bằng ô lưới, cao theo từng màn (h) để kiểm xuống hàng không đè.
const DESIGN_EXTENSION = {
  groups: [
    { id: 'g1', title: 'Nhóm 1', order: 1, screens: [['a', 100], ['b', 300], ['c', 100], ['d', 100], ['e', 200]].map(([k, h]) => ({ stem: 'g1-' + k, title: 'M ' + k, h })) },
    { id: 'g2', title: 'Nhóm 2', order: 2, screens: [{ stem: 'g2-a', title: 'N a', h: 150 }, { stem: 'g2-b', title: 'N b', h: 120 }] },
    { id: 'g3', title: 'Nhóm 3', order: 3, screens: [['a', 100], ['b', 100], ['c', 100]].map(([k, h]) => ({ stem: 'g3-' + k, title: 'P ' + k, h })) },
  ],
  prepare: async () => {},
  sourceTexts: (screen) => [screen.title],
  build: (screen) => {
    const f = figma.createFrame();
    f.name = screen.title;
    f.resize(ST_GRID.cellW, screen.h);
    const t = figma.createText();
    t.characters = screen.title;
    f.appendChild(t);
    return f;
  },
};

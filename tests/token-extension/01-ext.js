// Extension thử hook Token & Component: buildTokens(page) idempotent (tạo variable/text style/component set nếu chưa có).
const TK_COLORS = { 'color/primary': { r: 0.15, g: 0.39, b: 0.92 }, 'color/surface': { r: 0.96, g: 0.97, b: 1 } };
const TK_STYLES = ['Heading/H1', 'Body/Regular'];

async function tkVariables() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const col = cols.find((c) => c.name === 'Tokens') || figma.variables.createVariableCollection('Tokens');
  const have = await figma.variables.getLocalVariablesAsync();
  let created = 0;
  for (const name of Object.keys(TK_COLORS)) {
    if (have.some((v) => v.name === name)) continue;
    figma.variables.createVariable(name, col, 'COLOR').setValueForMode(col.modes[0].modeId, TK_COLORS[name]);
    created += 1;
  }
  return { created };
}

async function tkTextStyles() {
  const have = await figma.getLocalTextStylesAsync();
  let created = 0;
  for (const name of TK_STYLES) {
    if (have.some((s) => s.name === name)) continue;
    figma.createTextStyle().name = name;
    created += 1;
  }
  return { created };
}

function tkComponents(page) {
  if (page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'Button')) return [{ name: 'Button', created: 0, removed: 0 }];
  const variants = ['Default', 'Hover'].map((state) => {
    const c = figma.createComponent();
    c.name = 'State=' + state;
    return c;
  });
  figma.combineAsVariants(variants, page).name = 'Button';
  return [{ name: 'Button', created: 2, removed: 0 }];
}

const DESIGN_EXTENSION = {
  groups: [{ id: 'g1', title: 'Nhóm 1', order: 1, screens: [{ stem: 'g1-a', title: 'Màn a' }, { stem: 'g1-b', title: 'Màn b' }] }],
  prepare: async () => {},
  sourceTexts: (screen) => [screen.title],
  build: (screen) => {
    const f = figma.createFrame();
    f.name = screen.title;
    f.resize(ST_GRID.cellW, ST_GRID.cellH);
    const t = figma.createText();
    t.characters = screen.title;
    f.appendChild(t);
    return f;
  },
  buildTokens: async (page) => {
    if (!page.children.some((n) => n.name === 'Tổng quan token')) {
      const overview = figma.createFrame();
      overview.name = 'Tổng quan token';
      page.appendChild(overview);
    }
    return { variables: await tkVariables(), textStyles: await tkTextStyles(), components: tkComponents(page) };
  },
};

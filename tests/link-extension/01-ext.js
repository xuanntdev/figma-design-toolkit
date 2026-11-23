// Extension thử engine link bằng luật giả (không gắn thư viện UI hay dự án nào): màn là danh sách node { k: 'box'|'text', kind?, ... }.
// Luật: kind=btn -> component `btn` (Kind=primary|plain, text property Label); kind=card -> component `card`; kind=ghost -> component không tồn tại.
// buildTokens dựng biến c/red, c/black, r/sm, text style T/Body và component set btn + card (giống cách dự án thật dựng trang Token).
const FAKE_SCREENS = {
  'g1-a': [
    { k: 'box', kind: 'btn', primary: true, text: 'Lưu', x: 10, y: 10, w: 80, h: 32 },
    { k: 'box', kind: 'btn', primary: false, text: 'Hủy', x: 100, y: 10, w: 80, h: 32 },
    { k: 'box', kind: 'ghost', x: 10, y: 60, w: 50, h: 20 },
    { k: 'box', kind: 'boom', x: 70, y: 60, w: 50, h: 20 },
    { k: 'box', bg: '#ff0000', r: 4, x: 10, y: 100, w: 200, h: 80, c: [{ k: 'text', s: 'Xin chào', x: 8, y: 8, w: 60, h: 20, fs: 14, lh: 20, col: '#000000' }, { k: 'text', s: 'Lạ', x: 8, y: 40, w: 30, h: 20, fs: 13, lh: 20, col: '#123456' }] },
  ],
  'g1-b': [{ k: 'box', kind: 'card', x: 0, y: 0, w: 300, h: 100, c: [{ k: 'text', s: 'chìm', x: 0, y: 0, w: 10, h: 10, fs: 14, lh: 20, col: '#000000' }] },
    { k: 'box', kind: 'pa', x: 0, y: 200, w: 10, h: 10 }, { k: 'box', kind: 'pb', x: 20, y: 200, w: 10, h: 10 }],
};

function fakeHex(c) {
  return '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

function fakeRaw(parent, n, ctx) {
  const node = n.k === 'text' ? figma.createText() : figma.createFrame();
  parent.appendChild(node);
  node.x = n.x;
  node.y = n.y;
  node.resize(n.w, n.h);
  if (n.k === 'text') {
    node.fontName = { family: 'Inter', style: 'Regular' };
    node.fontSize = n.fs;
    node.lineHeight = { value: n.lh, unit: 'PIXELS' };
    node.characters = n.s;
    node.fills = stSolid(n.col, 1);
    return node;
  }
  node.fills = n.bg ? stSolid(n.bg, 1) : [];
  if (n.r) node.cornerRadius = n.r;
  lkBuildChildren(node, n.c || [], ctx, fakeRaw);
  return node;
}

const fakeCount = (n) => 1 + (n.c || []).reduce((s, c) => s + fakeCount(c), 0);
const FAKE_CTX = { count: fakeCount, label: (n) => (n.k === 'box' ? 'box.' + (n.kind || 'plain') : null) };

const FAKE_RULES = [
  { name: 'btn', match: (n) => (n.kind === 'btn' ? { comp: 'btn', variant: { Kind: n.primary ? 'primary' : 'plain' }, props: { Label: n.text }, name: 'Btn' } : null) },
  { name: 'card', match: (n) => (n.kind === 'card' ? { comp: 'card', size: false } : null) },
  { name: 'ghost', match: (n) => (n.kind === 'ghost' ? { comp: 'ghost' } : null) },
  {
    name: 'pair',
    matchRun: (list, i) => (list[i].kind === 'pa' && list[i + 1] && list[i + 1].kind === 'pb'
      ? { link: { comp: 'pair', name: 'Pair' }, span: 2, box: { x: list[i].x, y: list[i].y, w: 30, h: 10 } } : null),
  },
  { name: 'boom', match: (n) => { if (n.kind === 'boom') throw new Error('luật lỗi'); return null; } },
];

async function fakeBuildTokens(page) {
  const vars = figma.variables;
  const col = (await vars.getLocalVariableCollectionsAsync())[0] || vars.createVariableCollection('Fake');
  const have = {};
  (await vars.getLocalVariablesAsync()).forEach((v) => { have[v.name] = v; });
  const put = (name, type, val) => {
    const v = have[name] || vars.createVariable(name, col, type);
    v.setValueForMode(col.modes[0].modeId, val);
  };
  put('c/red', 'COLOR', { r: 1, g: 0, b: 0, a: 1 });
  put('c/black', 'COLOR', { r: 0, g: 0, b: 0, a: 1 });
  put('r/sm', 'FLOAT', 4);
  if (!(await figma.getLocalTextStylesAsync()).length) {
    const s = figma.createTextStyle();
    s.name = 'T/Body';
  }
  const sets = page.findAll((n) => n.type === 'COMPONENT_SET');
  if (sets.length) return { reused: true };
  const mk = (name, key, kids) => {
    const c = figma.createComponent();
    c.name = name;
    c.setPluginData('fakeComp', key);
    const t = figma.createText();
    c.appendChild(t);
    t.name = 'Label';
    t.characters = 'Button';
    t.componentPropertyReferences = {};
    return c;
  };
  const variants = [mk('Kind=primary', 'btn'), mk('Kind=plain', 'btn')];
  const set = figma.combineAsVariants(variants, page);
  const key = set.addComponentProperty('Label', 'TEXT', 'Button');
  variants.forEach((c) => { c.children[0].componentPropertyReferences = { characters: key }; });
  figma.combineAsVariants([mk('Type=box', 'card')], page);
  figma.combineAsVariants([mk('Type=pair', 'pair')], page);
  return { built: true };
}

const FAKE_TOKENS = () => ({
  fill: { '#ff0000': 'c/red' }, stroke: {}, text: { '#000000': 'c/black' }, radius: { 4: 'r/sm' },
  textStyles: [{ name: 'T/Body', family: 'Inter', style: 'Regular', size: 14, lineHeight: 20 }],
});

const DESIGN_EXTENSION = {
  groups: [{ id: 'g1', title: 'Nhóm 1', order: 1, screens: [{ stem: 'g1-a', title: 'A' }, { stem: 'g1-b', title: 'B' }] }],
  linkTag: 'fakeComp',
  linkRules: FAKE_RULES,
  linkTokens: FAKE_TOKENS,
  buildTokens: fakeBuildTokens,
  prepare: async () => {},
  sourceKey: (screen) => JSON.stringify(FAKE_SCREENS[screen.stem]),
  sourceTexts: () => [],
  build: (screen) => {
    const f = figma.createFrame();
    f.name = screen.title;
    f.resize(400, 300);
    lkBuildChildren(f, FAKE_SCREENS[screen.stem], FAKE_CTX, fakeRaw);
    return f;
  },
};

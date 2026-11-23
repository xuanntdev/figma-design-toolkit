// Ví dụ engine link (3/4) — trang "Token & Component" gồm 3 component mẫu: Button (Type=primary|default), Tag (Tone=blue|neutral), App/Header.
// buildTokens phải idempotent: chạy lại không nhân đôi (đã có component set cùng tên thì bỏ qua).
async function lkxButton(page) {
  const variants = [];
  for (const [i, type] of ['primary', 'default'].entries()) {
    const c = lkxComponent(page, 'Type=' + type, 'button', i);
    const primary = type === 'primary';
    lkxRow(c, { px: 18, py: 8, fill: primary ? 'color/bg/accent' : 'color/bg/surface' });
    lkxRadius(c, 'radius/pill');
    if (!primary) c.strokes = [lkxPaint('color/border/default')];
    await lkxText(c, 'Button', 'Label', 'Body/Strong', primary ? 'color/text/inverse' : 'color/text/default');
    variants.push(c);
  }
  lkxCombine(variants, page, 'Button', { Label: { def: 'Button', node: 'Label' } });
}

async function lkxTag(page) {
  const variants = [];
  for (const [i, tone] of ['blue', 'neutral'].entries()) {
    const c = lkxComponent(page, 'Tone=' + tone, 'tag', i);
    lkxRow(c, { px: 8, py: 2, fill: tone === 'blue' ? 'color/bg/accent-soft' : 'color/bg/muted' });
    lkxRadius(c, 'radius/pill');
    await lkxText(c, 'Tag', 'Label', 'Caption/Regular', tone === 'blue' ? 'color/text/accent' : 'color/text/muted');
    variants.push(c);
  }
  lkxCombine(variants, page, 'Tag', { Label: { def: 'Tag', node: 'Label' } });
}

// Thanh đầu trang: tiêu đề bên trái, nhóm liên kết bên phải (auto layout, giãn hai đầu), viền dưới bind biến.
async function lkxHeader(page) {
  const c = lkxComponent(page, 'State=default', 'app-header', 0);
  lkxRow(c, { px: 32, justify: 'SPACE_BETWEEN', fill: 'color/bg/surface' });
  c.primaryAxisSizingMode = 'FIXED';
  c.resize(1440, 57);
  c.strokes = [lkxPaint('color/border/default')];
  c.strokeTopWeight = c.strokeLeftWeight = c.strokeRightWeight = 0;
  c.strokeBottomWeight = 1;
  await lkxText(c, 'Title', 'Title', 'Body/Strong', 'color/text/default');
  const nav = figma.createFrame();
  c.appendChild(nav);
  nav.name = 'Nav';
  lkxRow(nav, { gap: 24 });
  await lkxText(nav, 'Link 1', 'Link1', 'Body/Medium', 'color/text/muted');
  await lkxText(nav, 'Link 2', 'Link2', 'Body/Medium', 'color/text/muted');
  const props = { Title: { def: 'Title', node: 'Title' }, Link1: { def: 'Link 1', node: 'Link1' }, Link2: { def: 'Link 2', node: 'Link2' } };
  lkxCombine([c], page, 'App/Header', props);
}

async function lkxBuild(page) {
  await page.loadAsync();
  const variables = await lkxEnsureVariables();
  const textStyles = await lkxEnsureTextStyles();
  await lkxLoadLib();
  const have = new Set(page.findAll((n) => n.type === 'COMPONENT_SET').map((n) => n.name));
  const parts = { Button: lkxButton, Tag: lkxTag, 'App/Header': lkxHeader };
  for (const name of Object.keys(parts)) if (!have.has(name)) await parts[name](page);
  return { variables, textStyles, components: Object.keys(parts).filter((n) => !have.has(n)) };
}

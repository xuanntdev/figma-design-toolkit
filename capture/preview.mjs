// Dựng lại snapshot thành HTML tuyệt đối (mô phỏng cách plugin Figma sẽ vẽ) rồi chụp -> captures/<group>/<stem>.preview.png
// để so với ảnh gốc <stem>.png mà không cần mở Figma.   Dùng: node preview.mjs <group-id> [stem...]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { KIT_ROOT, channelOption } from './lib/env.mjs';

const [group, ...only] = process.argv.slice(2);
const dir = path.join(KIT_ROOT, 'project/snapshots', group);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'group.json'), 'utf8'));
const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a ?? 1})`; };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function html(n, snap) {
  const box = `left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px;`;
  if (n.k === 's') return `<div style="position:absolute;${box}">${snap.svgs[n.v]}</div>`;
  if (n.k === 'i') return `<img style="position:absolute;${box}" src="${snap.imgs[n.v]}">`;
  if (n.k === 't') {
    const st = `font:${n.it ? 'italic ' : ''}${n.fw} ${n.fs}px/${n.ml ? n.lh + 'px' : 'normal'} '${n.f}';color:${rgba(n.col, n.ca)};text-align:${{ l: 'left', c: 'center', r: 'right' }[n.a]};letter-spacing:${n.ls || 0}px;`;
    const wrap = n.ml ? 'white-space:normal;' : `white-space:nowrap;${n.el ? 'overflow:hidden;text-overflow:ellipsis;' : ''}`;
    return `<div style="position:absolute;${box}${st}${wrap}${n.ul ? 'text-decoration:underline;' : ''}${n.st ? 'text-decoration:line-through;' : ''}">${esc(n.s)}</div>`;
  }
  const r = n.r == null ? '' : `border-radius:${Array.isArray(n.r) ? n.r.map((v) => v + 'px').join(' ') : n.r + 'px'};`;
  const sh = n.sh ? `box-shadow:${n.sh.map((s) => `${s.x}px ${s.y}px ${s.b}px ${s.s}px ${rgba(s.c, s.a)}`).join(',')};` : '';
  const bd = n.bd ? `border:${n.bd.w}px ${n.bd.d ? 'dashed' : 'solid'} ${rgba(n.bd.c, n.bd.a)};box-sizing:border-box;` : '';
  const st = `position:absolute;${box}${n.bg ? 'background:' + rgba(n.bg, n.ba) + ';' : ''}${r}${sh}${bd}${n.cl ? 'overflow:hidden;' : ''}${n.o != null ? 'opacity:' + n.o + ';' : ''}`;
  return `<div style="${st}">${(n.c || []).map((c) => html(c, snap)).join('')}</div>`;
}

const browser = await chromium.launch({ ...channelOption(), headless: true });
try {
  for (const s of meta.screens.filter((x) => !only.length || only.includes(x.stem))) {
    const snap = JSON.parse(fs.readFileSync(path.join(dir, `${s.stem}.json`), 'utf8'));
    const page = await browser.newPage({ viewport: { width: snap.w, height: snap.h } });
    await page.setContent(`<body style="margin:0;position:relative;width:${snap.w}px;height:${snap.h}px;background:${snap.bg};overflow:hidden">${snap.children.map((c) => html(c, snap)).join('')}</body>`);
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(KIT_ROOT, 'captures', group, `${s.stem}.preview.png`);
    await page.screenshot({ path: out });
    console.log(out);
    await page.close();
  }
} finally {
  await browser.close();
}

// Chạy TRONG trang (page.evaluate): duyệt DOM hiển thị -> cây node gọn (hộp có nền/viền, chữ, SVG, ảnh).
// Hàm phải tự chứa (không tham chiếu biến ngoài) vì được serialize vào trình duyệt.
export function snapshotDom(opts) {
  const MAX_IMG = opts.maxImageBytes || 120000;
  const svgs = [];
  const imgs = [];
  const fonts = {};
  const vw = window.innerWidth;
  const root = document.documentElement;
  const pageH = Math.max(root.scrollHeight, window.innerHeight);
  const r1 = (n) => Math.round(n * 2) / 2;
  const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');
  function color(str) {
    const m = /rgba?\(([^)]+)\)/.exec(str || '');
    if (!m) return null;
    const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? p[3] : 1;
    if (!(a > 0)) return null;
    return { h: '#' + hex2(p[0]) + hex2(p[1]) + hex2(p[2]), a: Math.round(a * 1000) / 1000 };
  }
  const px = (v) => parseFloat(v) || 0;
  function radius(cs, w, h) {
    const one = (v) => {
      const s = (v || '0').split(' ')[0];
      return s.endsWith('%') ? Math.min(w, h) * (parseFloat(s) / 100) : px(s);
    };
    const r = [one(cs.borderTopLeftRadius), one(cs.borderTopRightRadius), one(cs.borderBottomRightRadius), one(cs.borderBottomLeftRadius)]
      .map((v) => Math.min(r1(v), Math.min(w, h) / 2));
    if (r.every((v) => v === 0)) return undefined;
    return r.every((v) => v === r[0]) ? r[0] : r;
  }
  function shadows(cs) {
    if (!cs.boxShadow || cs.boxShadow === 'none') return undefined;
    const out = [];
    for (const part of cs.boxShadow.split(/,(?![^(]*\))/)) {
      if (/inset/.test(part)) continue;
      const c = color(part);
      const nums = part.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || [];
      if (!c || nums.length < 2) continue;
      const n = nums.map(px);
      out.push({ x: n[0], y: n[1], b: n[2] || 0, s: n[3] || 0, c: c.h, a: c.a });
    }
    return out.length ? out.slice(0, 3) : undefined;
  }
  function gradientColor(cs) {
    const bi = cs.backgroundImage;
    if (!bi || !/gradient/.test(bi)) return null;
    return color(bi.slice(bi.search(/rgba?\(/)));
  }
  function svgIndex(el, cs) {
    const clone = el.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const r = el.getBoundingClientRect();
    clone.setAttribute('width', r1(r.width));
    clone.setAttribute('height', r1(r.height));
    const col = (color(cs.color) || { h: '#000000' }).h;
    let s = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, col);
    if (!/\bfill=/.test(s.slice(0, s.indexOf('>') + 1)) && cs.fill && cs.fill !== 'none') {
      const f = color(cs.fill);
      if (f) s = s.replace('<svg', '<svg fill="' + f.h + '"');
    }
    let i = svgs.indexOf(s);
    if (i < 0) i = svgs.push(s) - 1;
    return i;
  }
  function imgIndex(dataUrl) {
    let i = imgs.indexOf(dataUrl);
    if (i < 0) i = imgs.push(dataUrl) - 1;
    return i;
  }
  function imageData(el) {
    try {
      if (el.tagName === 'CANVAS') return el.toDataURL('image/png');
      const c = document.createElement('canvas');
      c.width = el.naturalWidth;
      c.height = el.naturalHeight;
      c.getContext('2d').drawImage(el, 0, 0);
      return c.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }
  function textOf(node, cs) {
    let t = node.nodeValue || '';
    if (!/^pre/.test(cs.whiteSpace)) t = t.replace(/\s+/g, ' ');
    t = t.trim();
    const tt = cs.textTransform;
    if (tt === 'uppercase') t = t.toUpperCase();
    else if (tt === 'lowercase') t = t.toLowerCase();
    else if (tt === 'capitalize') t = t.replace(/\b\w/g, (m) => m.toUpperCase());
    return t;
  }
  function fontOf(cs) {
    const fam = (cs.fontFamily.split(',')[0] || '').replace(/["']/g, '').trim();
    const w = parseInt(cs.fontWeight, 10) || 400;
    (fonts[fam] = fonts[fam] || {})[w + (cs.fontStyle === 'italic' ? 'i' : '')] = 1;
    const fs = px(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? Math.round(fs * 1.25 * 100) / 100 : px(cs.lineHeight);
    return { f: fam, fs, fw: w, lh, ls: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing), it: cs.fontStyle === 'italic' ? 1 : undefined };
  }
  function textNode(txt, rect, cs, ox, oy, el, lines) {
    const al = { center: 'c', right: 'r', end: 'r', justify: 'l' }[cs.textAlign] || 'l';
    const n = Object.assign({ k: 't', s: txt, x: r1(rect.left - ox), y: r1(rect.top - oy), w: r1(rect.width), h: r1(rect.height), a: al }, fontOf(cs));
    const c = color(cs.color) || { h: '#000000', a: 1 };
    n.col = c.h;
    if (c.a < 1) n.ca = c.a;
    if (lines > 1) n.ml = 1;
    if (cs.textOverflow === 'ellipsis' && el && el.scrollWidth > el.clientWidth + 1) n.el = 1;
    if (/underline/.test(cs.textDecorationLine)) n.ul = 1;
    if (/line-through/.test(cs.textDecorationLine)) n.st = 1;
    return n;
  }
  function ownTexts(el, cs, ox, oy, clip) {
    const out = [];
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
      const txt = textOf(node, cs);
      if (!txt) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length) continue;
      const box = range.getBoundingClientRect();
      const lines = new Set(rects.map((r) => Math.round(r.top))).size;
      if (clip && !hit(box, clip)) continue;
      out.push(textNode(txt, box, cs, ox, oy, el, lines));
    }
    return out;
  }
  function pseudoText(el, which, ox, oy, nodeBox) {
    const ps = getComputedStyle(el, which);
    const content = ps.content;
    if (!content || content === 'none' || content === 'normal' || ps.display === 'none' || ps.position === 'absolute' || ps.position === 'fixed') return null;
    const m = /^"(.+)"$/.exec(content);
    if (!m || !m[1].trim()) return null;
    const cv = document.createElement('canvas').getContext('2d');
    cv.font = ps.fontStyle + ' ' + ps.fontWeight + ' ' + ps.fontSize + ' ' + ps.fontFamily;
    const w = cv.measureText(m[1]).width;
    const rect = { left: which === '::before' ? nodeBox.left : nodeBox.right - w, top: nodeBox.top, width: w, height: px(ps.lineHeight) || nodeBox.height };
    return textNode(m[1], rect, ps, ox, oy, null, 1);
  }
  function hit(r, c) {
    return r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom;
  }
  function sideRects(cs, w, h) {
    const sides = [['Top', 0, 0, w, 'h'], ['Bottom', 0, 0, w, 'h'], ['Left', 0, 0, h, 'v'], ['Right', 0, 0, h, 'v']];
    const out = [];
    for (const [s, , , len, dir] of sides) {
      const bw = px(cs['border' + s + 'Width']);
      const c = color(cs['border' + s + 'Color']);
      if (!bw || !c || cs['border' + s + 'Style'] === 'none') continue;
      const horiz = dir === 'h';
      out.push({ k: 'f', n: 'border-' + s.toLowerCase(), bg: c.h, ba: c.a < 1 ? c.a : undefined,
        x: s === 'Right' ? r1(w - bw) : 0, y: s === 'Bottom' ? r1(h - bw) : 0, w: horiz ? r1(len) : bw, h: horiz ? bw : r1(len) });
    }
    return out;
  }
  function nameOf(el) {
    const id = el.getAttribute('data-testid') || el.getAttribute('aria-label');
    if (id) return id.slice(0, 40);
    const cls = [...el.classList].find((c) => /^(ant-|Mui|chakra-)/.test(c)) || el.classList[0];
    return (el.tagName.toLowerCase() + (cls ? '.' + cls : '')).slice(0, 40);
  }
  function visible(el, cs) {
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    return true;
  }
  function paint(el, cs, rect) {
    const bg = color(cs.backgroundColor) || gradientColor(cs);
    const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some((s) => px(cs['border' + s + 'Width']) > 0 && color(cs['border' + s + 'Color']) && cs['border' + s + 'Style'] !== 'none');
    const sh = shadows(cs);
    const clipped = (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && el !== document.body && el !== root;
    const op = parseFloat(cs.opacity) < 1;
    return { bg, hasBorder, sh, clipped, op, any: !!(bg || hasBorder || sh || clipped || op) };
  }
  function bgImageNode(cs, w, h) {
    const m = /url\("?([^")]+)"?\)/.exec(cs.backgroundImage || '');
    return m ? { src: m[1], w, h } : null;
  }
  function leaf(el, cs, rect, ox, oy) {
    const tag = el.tagName.toLowerCase();
    const base = { x: r1(rect.left - ox), y: r1(rect.top - oy), w: r1(rect.width), h: r1(rect.height) };
    if (tag === 'svg') return Object.assign({ k: 's', n: nameOf(el), v: svgIndex(el, cs) }, base);
    if (tag === 'canvas' || (tag === 'img' && el.complete && el.naturalWidth)) {
      const d = imageData(el);
      if (d && d.length < MAX_IMG * 1.4) return Object.assign({ k: 'i', n: nameOf(el), v: imgIndex(d) }, base);
      return Object.assign({ k: 'f', n: 'image-placeholder', bg: '#E5E7EB' }, base);
    }
    return null;
  }
  function inputText(el, cs, rect, ox, oy) {
    const val = el.value || '';
    const ph = !val && el.placeholder;
    const txt = val || ph;
    if (!txt || /^(checkbox|radio|hidden|file|range|color)$/.test(el.type)) return null;
    const pc = ph ? getComputedStyle(el, '::placeholder') : cs;
    const lh = px(cs.lineHeight) || px(cs.fontSize) * 1.25;
    const h = el.tagName === 'TEXTAREA' ? rect.height - px(cs.paddingTop) - px(cs.paddingBottom) : lh;
    const top = el.tagName === 'TEXTAREA' ? rect.top + px(cs.borderTopWidth) + px(cs.paddingTop) : rect.top + (rect.height - lh) / 2;
    const left = rect.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
    const width = rect.width - (left - rect.left) - px(cs.paddingRight) - px(cs.borderRightWidth);
    const style = Object.assign({}, { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, textAlign: cs.textAlign, color: pc.color, textDecorationLine: 'none', textOverflow: 'clip' });
    const n = textNode(txt, { left, top, width, height: h }, style, ox, oy, null, el.tagName === 'TEXTAREA' ? 2 : 1);
    if (el.tagName !== 'TEXTAREA') n.el = 1;
    return n;
  }
  function walk(el, ox, oy, clip, out) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) return;
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    if (/^(script|style|noscript|link|meta|head)$/.test(tag)) return;
    const empty = rect.width <= 0 || rect.height <= 0;
    const p = paint(el, cs, rect);
    if (empty && p.clipped) return;
    if (empty) {
      for (const ch of el.children) walk(ch, ox, oy, clip, out);
      return;
    }
    if (!empty && clip && !hit(rect, clip) && cs.position !== 'fixed') return;
    const lf = !empty && leaf(el, cs, rect, ox, oy);
    if (lf) {
      out.push(lf);
      return;
    }
    const isInput = /^(input|textarea|select)$/.test(tag);
    let node = null;
    let nox = ox;
    let noy = oy;
    let nclip = clip;
    const img = bgImageNode(cs, rect.width, rect.height);
    if (!empty && (p.any || isInput || img)) {
      node = { k: 'f', n: nameOf(el), x: r1(rect.left - ox), y: r1(rect.top - oy), w: r1(rect.width), h: r1(rect.height), c: [] };
      const col = color(cs.backgroundColor) || gradientColor(cs);
      if (col) {
        node.bg = col.h;
        if (col.a < 1) node.ba = col.a;
        if (!color(cs.backgroundColor)) node.gr = 1;
      }
      const r = radius(cs, rect.width, rect.height);
      if (r !== undefined) node.r = r;
      const sh = p.sh;
      if (sh) node.sh = sh;
      if (p.clipped) node.cl = 1;
      if (p.op) node.o = Math.round(parseFloat(cs.opacity) * 100) / 100;
      const bw = ['Top', 'Right', 'Bottom', 'Left'].map((s) => px(cs['border' + s + 'Width']));
      const bc = ['Top', 'Right', 'Bottom', 'Left'].map((s) => cs['border' + s + 'Color']);
      const bs = ['Top', 'Right', 'Bottom', 'Left'].map((s) => cs['border' + s + 'Style']);
      const uniform = bw.every((v) => v === bw[0]) && bc.every((v) => v === bc[0]) && bs.every((v) => v === bs[0]);
      if (p.hasBorder && uniform && bs[0] !== 'none') {
        const c = color(bc[0]);
        node.bd = { c: c.h, w: bw[0] };
        if (c.a < 1) node.bd.a = c.a;
        if (bs[0] === 'dashed' || bs[0] === 'dotted') node.bd.d = 1;
      } else if (p.hasBorder) {
        node.c.push(...sideRects(cs, rect.width, rect.height));
      }
      if (img) node.bi = img.src;
      if (p.clipped) nclip = { left: Math.max(rect.left, clip.left), top: Math.max(rect.top, clip.top), right: Math.min(rect.right, clip.right), bottom: Math.min(rect.bottom, clip.bottom) };
      nox = rect.left;
      noy = rect.top;
    }
    const kids = node ? node.c : out;
    const before = pseudoText(el, '::before', nox, noy, rect);
    if (before) kids.push(before);
    if (isInput) {
      const t = inputText(el, cs, rect, nox, noy);
      if (t) kids.push(t);
    } else {
      kids.push(...ownTexts(el, cs, nox, noy, nclip));
      const children = [...el.children].map((ch, i) => ({ ch, i, z: zOf(ch) })).sort((a, b) => a.z - b.z || a.i - b.i);
      for (const { ch } of children) walk(ch, nox, noy, nclip, kids);
    }
    const after = pseudoText(el, '::after', nox, noy, rect);
    if (after) kids.push(after);
    if (node) {
      if (!node.c.length) delete node.c;
      if (node.c || node.bg || node.bd || node.sh || node.bi) out.push(node);
    }
  }
  function zOf(el) {
    const cs = getComputedStyle(el);
    if (cs.position === 'static') return 0;
    const z = parseInt(cs.zIndex, 10);
    return Number.isNaN(z) ? 0 : z;
  }
  const bodyBg = color(getComputedStyle(document.body).backgroundColor) || color(getComputedStyle(root).backgroundColor) || { h: '#FFFFFF' };
  const children = [];
  walk(document.body, 0, 0, { left: 0, top: 0, right: vw, bottom: pageH }, children);
  return {
    w: vw, h: pageH, bg: bodyBg.h, fonts, svgs, imgs, children,
    url: location.href,
  };
}

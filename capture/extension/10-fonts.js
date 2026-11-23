// Font: dò font trang web dùng (vd Public Sans); Figma không có thì rơi về Inter. Lỗi nạp font KHÔNG làm vỡ cả lượt.
// Nạp hết trong prepare() (build màn là đồng bộ), lúc dựng chỉ tra cache bằng snapFont().
const SNAP_FALLBACK = 'Inter';
const SNAP_WEIGHT_STYLES = {
  100: ['Thin'], 200: ['ExtraLight', 'UltraLight'], 300: ['Light'], 400: ['Regular', 'Normal'], 500: ['Medium'],
  600: ['SemiBold', 'DemiBold'], 700: ['Bold'], 800: ['ExtraBold', 'UltraBold'], 900: ['Black', 'Heavy'],
};
const SNAP_FONT_CACHE = {};
const SNAP_FONT_NOTES = { fallback: {}, missing: {} };
let SNAP_FONT_INDEX = null;

function snapNorm(s) {
  return String(s).toLowerCase().replace(/[\s_-]+/g, '');
}

async function snapIndexFonts() {
  if (SNAP_FONT_INDEX) return SNAP_FONT_INDEX;
  SNAP_FONT_INDEX = {};
  if (typeof figma.listAvailableFontsAsync !== 'function') return SNAP_FONT_INDEX;
  for (const f of await figma.listAvailableFontsAsync()) {
    (SNAP_FONT_INDEX[f.fontName.family] = SNAP_FONT_INDEX[f.fontName.family] || []).push(f.fontName.style);
  }
  return SNAP_FONT_INDEX;
}

// Chọn style có sẵn gần weight nhất (ưu tiên đúng tên, rồi weight lân cận); italic nếu có.
function snapPickStyle(styles, weight, italic) {
  const pool = styles.filter((s) => /italic|oblique/i.test(s) === !!italic);
  const list = pool.length ? pool : styles;
  const order = Object.keys(SNAP_WEIGHT_STYLES).map(Number).sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight));
  for (const w of order) {
    for (const name of SNAP_WEIGHT_STYLES[w]) {
      const hit = list.find((s) => snapNorm(s).replace(/italic|oblique/g, '') === snapNorm(name) || (w === 400 && snapNorm(s) === 'italic'));
      if (hit) return hit;
    }
  }
  return list[0] || 'Regular';
}

async function snapTryLoad(family, styles, weight, italic) {
  if (!styles || !styles.length) return null;
  const font = { family, style: snapPickStyle(styles, weight, italic) };
  try {
    await figma.loadFontAsync(font);
    return font;
  } catch (e) {
    return null;
  }
}

async function snapLoadOne(family, wkey) {
  const italic = /i$/.test(wkey);
  const weight = parseInt(wkey, 10) || 400;
  const index = await snapIndexFonts();
  let font = await snapTryLoad(family, index[family], weight, italic);
  if (font) return font;
  SNAP_FONT_NOTES.fallback[family] = true;
  font = await snapTryLoad(SNAP_FALLBACK, index[SNAP_FALLBACK], weight, italic);
  if (font) return font;
  const plain = { family: SNAP_FALLBACK, style: 'Regular' };
  await figma.loadFontAsync(plain);
  return plain;
}

// fonts: { "Public Sans": { "400": 1, "600": 1, "400i": 1 } } gộp từ các snapshot.
async function snapLoadFonts(fonts) {
  for (const family of Object.keys(fonts)) {
    for (const wkey of Object.keys(fonts[family])) {
      const key = family + '|' + wkey;
      if (!SNAP_FONT_CACHE[key]) SNAP_FONT_CACHE[key] = await snapLoadOne(family, wkey);
    }
  }
}

function snapFont(family, weight, italic) {
  const hit = SNAP_FONT_CACHE[family + '|' + weight + (italic ? 'i' : '')];
  if (hit) return hit;
  SNAP_FONT_NOTES.missing[family + '|' + weight] = true;
  return SNAP_FONT_CACHE[SNAP_FALLBACK + '|400'] || { family: SNAP_FALLBACK, style: 'Regular' };
}

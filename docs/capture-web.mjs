// Script mẫu chụp ảnh giao diện Web Sáng/Tối bằng Playwright để làm tham chiếu dựng màn Figma.
// Chạy ở thư mục gốc kit: node docs/capture-web.mjs http://localhost:4173/settings settings
// Viewport lấy theo `frame` trong project/design-sync.json; chưa init thì dùng 393×873.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRESETS = { mobile: [393, 873], tablet: [834, 1194], desktop: [1440, 1024] };

function projectViewport() {
  const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = path.join(kit, 'project', 'design-sync.json');
  if (fs.existsSync(file)) {
    const frame = JSON.parse(fs.readFileSync(file, 'utf8')).frame || 'mobile';
    if (typeof frame === 'object') return { width: frame.width, height: frame.height };
    const m = String(frame).toLowerCase().match(/^(\d+)\s*[x×]\s*(\d+)$/);
    const [width, height] = m ? [Number(m[1]), Number(m[2])] : (PRESETS[String(frame).toLowerCase()] || PRESETS.mobile);
    return { width, height };
  }
  return { width: 393, height: 873 };
}

const url = process.argv[2] || 'http://localhost:4173/';
const screenId = process.argv[3] || 'home';
const outRoot = path.resolve('captures/current');
const viewport = projectViewport();

const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    const dir = path.join(outRoot, theme);
    fs.mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, colorScheme: theme, locale: 'vi-VN' });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { await document.fonts.ready; });
    const outFile = path.join(dir, `${screenId}.png`);
    await page.screenshot({ path: outFile, animations: 'disabled', scale: 'css' });
    console.log(`Đã lưu (${viewport.width}×${viewport.height}):`, outFile);
    await page.close();
  }
} finally {
  await browser.close();
}

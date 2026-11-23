// Công cụ dò màn (chỉ đọc): mở 1 route, in ra tab / nút / bảng / input để biết cách viết kịch bản chụp.
// Dùng: FIRST_ROW=1 (bấm link dòng đầu bảng trước) node explore.mjs /orders   (thêm --click "Tên tab" để bấm 1 tab/nút rồi dò lại; chỉ GET)
import { chromium } from 'playwright';
import { loadEnv, channelOption } from './lib/env.mjs';
import { installReadOnlyGuard } from './lib/guard.mjs';

const [route = '/', ...rest] = process.argv.slice(2);
const clicks = rest.flatMap((a, i) => (a === '--click' ? [rest[i + 1]] : []));
const env = await loadEnv();
const browser = await chromium.launch({ ...channelOption(), headless: false });
try {
  const ctx = await browser.newContext({ storageState: env.storageState, viewport: { width: 1440, height: 1024 }, locale: 'vi-VN', ignoreHTTPSErrors: true });
  await installReadOnlyGuard(ctx);
  const page = await ctx.newPage();
  await page.goto(new URL(route.replace(/^\//, ''), env.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  if (process.env.FIRST_ROW) {
    await page.locator('tbody tr a').first().click();
    await page.waitForURL(/\/\d+/);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForFunction(() => !document.querySelector('.ant-spin-spinning, .ant-skeleton-active'), null, { timeout: 15000 }).catch(() => {});
  }
  for (const c of clicks) {
    await page.getByText(c, { exact: true }).first().click();
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  const info = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const txt = (e) => (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const list = (sel) => [...document.querySelectorAll(sel)].filter(vis).map(txt);
    return {
      url: location.href,
      tabs: list('[role=tab]'),
      buttons: list('button'),
      menus: list('.ant-dropdown-trigger, [aria-haspopup]'),
      tables: [...document.querySelectorAll('table')].filter(vis).map((t) => [...t.querySelectorAll('th')].map(txt)),
      inputs: [...document.querySelectorAll('input,textarea')].filter(vis).map((e) => e.placeholder || e.name || e.type),
      modals: list('.ant-modal-title, .ant-drawer-title'),
      font: getComputedStyle(document.body).fontFamily,
      height: document.documentElement.scrollHeight,
    };
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  await browser.close();
  await env.stop();
}

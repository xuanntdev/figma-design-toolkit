// Ngữ cảnh chụp cho file kịch bản nhóm (groups/<id>.mjs): goto, snap, step, các nút an toàn.
// Selector spinner / lớp phủ mặc định hỗ trợ Ant Design + role=dialog; đổi bằng CAPTURE_SPINNER_SELECTOR / CAPTURE_OVERLAY_SELECTOR / CAPTURE_LAYER_SELECTOR.
import fs from 'node:fs';
import path from 'node:path';
import { snapshotDom } from './dom-snapshot.mjs';
import { KIT_ROOT } from './env.mjs';
import { blocked } from './guard.mjs';
import { resolveBgImages } from './assets.mjs';

export const VIEWPORT = { width: 1440, height: 1024 };
/** Nhãn nút KHÔNG BAO GIỜ được bấm (ghi/gửi/duyệt/xoá). Bấm bằng ctx.click sẽ ném lỗi. */
const FORBIDDEN = /^(lưu|gửi|duyệt|phê duyệt|xác nhận|đồng ý|xóa|xoá|từ chối|hoàn thành|hoàn tất|tạo|cập nhật|submit|save|ok|import|tải lên|upload|kích hoạt|đặt hàng|checkout|delete|remove|confirm|approve|reject|thực hiện)\b/i;
const SPINNER = process.env.CAPTURE_SPINNER_SELECTOR || '.ant-spin-spinning, .ant-skeleton-active, [aria-busy="true"]';
const OVERLAY = process.env.CAPTURE_OVERLAY_SELECTOR || '.ant-modal-wrap:visible .ant-modal, .ant-drawer-open .ant-drawer-content-wrapper, [role="dialog"]:visible';
const LAYER = process.env.CAPTURE_LAYER_SELECTOR || '.ant-modal-wrap:visible, .ant-drawer-open, [role="dialog"]:visible';
const CLOSERS = ['Đóng', 'Hủy', 'Huỷ', 'Quay lại', 'Cancel', 'Close'];

export function createContext({ page, env, group, report }) {
  const outDir = path.join(KIT_ROOT, 'project/snapshots', group.id);
  const shotDir = path.join(KIT_ROOT, 'captures', group.id);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(shotDir, { recursive: true });
  const screens = [];

  const ctx = {
    page, env, group, screens,
    url: (route) => new URL(route.replace(/^\//, ''), env.baseUrl).toString(),

    /** Mở route của web và chờ ổn định (mạng + spinner). */
    async goto(route) {
      await page.goto(ctx.url(route), { waitUntil: 'domcontentloaded' });
      await ctx.settle();
    },

    /** Chờ mạng im, hết spinner/skeleton, hết animation hữu hạn (không ngủ cố định). */
    async settle() {
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForFunction((sel) => !document.querySelector(sel), SPINNER, { timeout: 15000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).every((a) => a.playState !== 'running'), null, { timeout: 5000 }).catch(() => {});
    },

    /** Chụp 1 trạng thái. fit=true: kéo cao viewport theo nội dung cuộn (full-page); fit:'overlay' cho modal/drawer có thân cuộn; fit:false giữ 1440×1024. */
    async snap(stem, title, { fit = true } = {}) {
      await ctx.settle();
      await page.setViewportSize(VIEWPORT);
      if (fit) await fitViewport(page, fit === 'overlay');
      const data = await page.evaluate(snapshotDom, { maxImageBytes: 120000 });
      await resolveBgImages(page, data);
      const id = `${group.id}-${stem}`;
      const file = { v: 1, id, group: group.id, stem: id, title, route: new URL(page.url()).pathname, order: screens.length, ...data };
      fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(file));
      await page.screenshot({ path: path.join(shotDir, `${id}.png`), animations: 'disabled' });
      screens.push({ stem: id, title });
      report.captured.push({ stem: id, title, nodes: countNodes(data.children), kb: Math.round(JSON.stringify(file).length / 1024), h: data.h });
      await page.setViewportSize(VIEWPORT);
      return id;
    },

    /** Chạy 1 bước, tối đa 2 lượt; lỗi thì ghi vào report rồi đi tiếp (trả false). */
    async step(name, fn) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await fn();
          return true;
        } catch (err) {
          const msg = String(err && err.message || err).split('\n')[0].slice(0, 300);
          if (attempt === 2) report.failed.push({ step: name, error: msg });
          console.log(`  ! ${name} (lượt ${attempt}): ${msg}`);
          await ctx.recover();
        }
      }
      return false;
    },

    /** Bấm an toàn: từ chối nhãn ghi/gửi/duyệt. locator = Playwright Locator. */
    async click(locator, label) {
      const text = (label || (await locator.first().innerText().catch(() => '')) || '').trim();
      if (FORBIDDEN.test(text)) throw new Error(`Từ chối bấm nút ghi/gửi: "${text}"`);
      await locator.first().click({ timeout: 8000 });
      await ctx.settle();
    },

    /**
     * Bấm nút mang nhãn ghi (Thực hiện/Từ chối/Tạo…) CHỈ để mở modal, rồi chờ modal hiện.
     * Guard vẫn chặn mọi request ghi; chỉ dùng trên bản ghi của chính account chụp,
     * chụp xong phải ctx.closeTop() — không bao giờ bấm nút submit trong modal.
     */
    async openModal(locator) {
      await locator.first().click({ timeout: 8000 });
      await ctx.overlay();
    },

    /** Chờ modal/drawer trên cùng hiện đủ (hết animation). */
    async overlay() {
      await page.locator(OVERLAY).last().waitFor({ state: 'visible', timeout: 12000 });
      await ctx.settle();
    },

    /** Đóng modal/drawer trên cùng bằng Đóng/Hủy/X (hoặc Esc). Không bao giờ bấm nút Lưu/Gửi. */
    async closeTop() {
      const layer = page.locator(LAYER).last();
      if (!(await layer.count())) return;
      for (const label of CLOSERS) {
        const b = layer.getByRole('button', { name: label, exact: true });
        if (await b.count()) {
          await b.first().click({ timeout: 5000 });
          break;
        }
      }
      if (await layer.isVisible().catch(() => false)) await page.keyboard.press('Escape');
      await layer.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    },

    /** Dọn lớp phủ còn sót sau một bước lỗi. */
    async recover() {
      for (let i = 0; i < 3; i += 1) {
        if (!(await page.locator(`${LAYER}, .ant-dropdown:visible, .ant-select-dropdown:visible`).count())) return;
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => new Promise((res) => requestAnimationFrame(() => res(true))));
      }
    },

    /** Bấm 1 tab theo tên (role=tab). */
    async tab(name) {
      await ctx.click(page.getByRole('tab', { name, exact: true }), 'tab');
    },
  };
  return ctx;
}

function countNodes(list) {
  return (list || []).reduce((n, x) => n + 1 + countNodes(x.c), 0);
}

/** Kéo cao viewport để vùng cuộn trong trang (layout 100vh) hiện hết nội dung. overlay=true: chỉ xét thân cuộn trong modal/drawer. */
export async function fitViewport(page, overlay = false) {
  for (let i = 0; i < 3; i += 1) {
    const extra = await page.evaluate((ov) => {
      let max = ov ? 0 : document.documentElement.scrollHeight - window.innerHeight;
      const layer = '.ant-modal-wrap, .ant-drawer, [role="dialog"]';
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (!/(auto|scroll)/.test(cs.overflowY) || el.clientHeight < 100) continue;
        if (ov !== !!el.closest(layer)) continue;
        if (el.closest('.ant-select-dropdown, .ant-dropdown, .ant-table-body, .ant-table-content')) continue;
        max = Math.max(max, el.scrollHeight - el.clientHeight);
      }
      return Math.max(0, Math.ceil(max));
    }, overlay);
    if (extra < 4) return;
    const size = page.viewportSize();
    await page.setViewportSize({ width: size.width, height: Math.min(size.height + extra, 8000) });
    await page.waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
  }
}

export function blockedWrites() {
  return blocked;
}

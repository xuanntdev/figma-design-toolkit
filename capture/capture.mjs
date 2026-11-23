// Chụp 1 nhóm màn web (CHỈ ĐỌC) -> project/snapshots/<group-id>/ + captures/<group-id>/*.png
// Dùng:  node capture.mjs <group-id>      (kịch bản ở groups/<group-id>.mjs)
//        node capture.mjs --list
// Môi trường: CAPTURE_BASE_URL, CAPTURE_STORAGE_STATE (xem lib/env.mjs); CAPTURE_HEADLESS=1 chạy không giao diện (mặc định mở cửa sổ); CAPTURE_CHANNEL (mặc định chrome; đặt rỗng để dùng Chromium của Playwright).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { loadEnv, channelOption, KIT_ROOT } from './lib/env.mjs';
import { installReadOnlyGuard } from './lib/guard.mjs';
import { createContext, VIEWPORT, blockedWrites } from './lib/runner.mjs';

const GROUPS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'groups');
const arg = process.argv[2];

if (!arg || arg === '--list') {
  console.log(fs.readdirSync(GROUPS_DIR).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, '')).join('\n'));
  process.exit(0);
}

const file = path.join(GROUPS_DIR, `${arg}.mjs`);
if (!fs.existsSync(file)) throw new Error(`Chưa có kịch bản ${file}`);
const group = (await import(pathToFileURL(file).href)).default;
if (group.id !== arg) throw new Error(`group.id (${group.id}) phải trùng tên file (${arg}).`);

const env = await loadEnv();
const shotDir = path.join(KIT_ROOT, 'captures', group.id);
fs.mkdirSync(shotDir, { recursive: true });
const logFile = path.join(shotDir, 'capture.log');
fs.writeFileSync(logFile, '');
const origLog = console.log;
console.log = (...a) => { const line = a.join(' '); origLog(line); fs.appendFileSync(logFile, line + '\n'); };

const report = { group: group.id, baseUrl: env.baseUrl, startedAt: new Date().toISOString(), captured: [], failed: [] };
const browser = await chromium.launch({ ...channelOption(), headless: process.env.CAPTURE_HEADLESS === '1' });
try {
  const context = await browser.newContext({ storageState: env.storageState, viewport: VIEWPORT, locale: env.locale, timezoneId: env.timezone, ignoreHTTPSErrors: true, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  await installReadOnlyGuard(context);
  const page = await context.newPage();
  const ctx = createContext({ page, env, group, report });
  console.log(`== ${group.id} · ${group.title} · ${env.baseUrl}`);
  await group.run(ctx);
  writeGroup(group, ctx.screens, report);
} finally {
  await browser.close();
  await env.stop();
  const counts = {};
  for (const w of blockedWrites()) counts[w] = (counts[w] || 0) + 1;
  report.blockedWrites = counts;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(shotDir, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`== xong: ${report.captured.length} trạng thái, ${report.failed.length} bước lỗi, ${Object.values(report.blockedWrites).reduce((a, b) => a + b, 0)} request ghi bị chặn (${Object.keys(report.blockedWrites).join(', ') || 'không'})`);
  for (const f of report.failed) console.log(`   LỖI ${f.step}: ${f.error}`);
}

function writeGroup(g, screens, rep) {
  const dir = path.join(KIT_ROOT, 'project/snapshots', g.id);
  const have = new Set(screens.map((s) => s.stem));
  const stale = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'group.json').map((f) => f.replace(/\.json$/, '')).filter((s) => !have.has(s));
  rep.stale = stale;
  const titleOf = (stem) => JSON.parse(fs.readFileSync(path.join(dir, `${stem}.json`), 'utf8')).title;
  const all = [...screens, ...stale.map((stem) => ({ stem, title: titleOf(stem) }))];
  fs.writeFileSync(path.join(dir, 'group.json'), JSON.stringify({ id: g.id, title: g.title, order: g.order ?? 99, ...(g.area ? { area: g.area } : {}), screens: all }, null, 1) + '\n');
}

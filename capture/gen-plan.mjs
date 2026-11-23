// Sinh project/extension/data/<group>.gen.json + project/draft-plan.json từ MỌI nhóm đã chụp (project/snapshots/*/group.json).
// Chạy 1 lần ở phiên điều phối sau khi các agent chụp xong:  node capture/gen-plan.mjs   rồi  python3 design_sync.py build
// Build nhẹ theo nhóm (code.js chỉ nhúng nhóm chọn):  node capture/gen-plan.mjs --groups orders,reports
import fs from 'node:fs';
import path from 'node:path';
import { KIT_ROOT } from './lib/env.mjs';

const SNAP = path.join(KIT_ROOT, 'project/snapshots');
const DATA = path.join(KIT_ROOT, 'project/extension/data');
fs.mkdirSync(DATA, { recursive: true });

const groups = fs.existsSync(SNAP)
  ? fs.readdirSync(SNAP).filter((d) => fs.existsSync(path.join(SNAP, d, 'group.json')))
    .map((d) => JSON.parse(fs.readFileSync(path.join(SNAP, d, 'group.json'), 'utf8')))
  : [];
groups.sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));

// Màn loại khỏi plugin: project/exclude.json = {comment, exclude:[{stem, reason}]}. Snapshot vẫn giữ trên đĩa; chỉ bỏ khỏi plan, luồng, đếm màn.
// gen.json ghi thêm `exclude: [stem…]` để bộ build (kit_core/build.py) bỏ snapshot đó khỏi code.js khi nó hỗ trợ trường này.
const EXCLUDE_FILE = path.join(KIT_ROOT, 'project/exclude.json');
const excludeList = fs.existsSync(EXCLUDE_FILE) ? (JSON.parse(fs.readFileSync(EXCLUDE_FILE, 'utf8')).exclude || []) : [];
const excludeSet = new Set(excludeList.map((e) => e.stem));
const allStems = new Set(groups.flatMap((g) => g.screens.map((s) => s.stem)));
const excludeWarnings = excludeList.filter((e) => !allStems.has(e.stem)).map((e) => `exclude.json: stem không tồn tại: ${e.stem}`);
for (const g of groups) {
  g.allStems = new Set(g.screens.map((s) => s.stem));
  g.excluded = g.screens.filter((s) => excludeSet.has(s.stem)).map((s) => s.stem);
  g.screens = g.screens.filter((s) => !excludeSet.has(s.stem));
}

// Luồng con (Section lồng trong Section nhóm trên canvas): project/flows.json = { "<groupId>": [{id, title, screens:[stem…]}] }.
// Kiểm trên MỌI nhóm đã chụp (trước khi lọc --groups): stem không tồn tại / trùng luồng -> lỗi; màn chưa gán -> luồng KHÁC + cảnh báo.
const DEFAULT_FLOW_ID = 'khac';
const DEFAULT_FLOW_TITLE = 'KHÁC';
const FLOWS_FILE = path.join(KIT_ROOT, 'project/flows.json');
const flowsCfg = fs.existsSync(FLOWS_FILE) ? JSON.parse(fs.readFileSync(FLOWS_FILE, 'utf8')) : (console.warn('CẢNH BÁO: thiếu project/flows.json, mọi màn vào luồng KHÁC'), {});
const areaOf = (g) => g.area || 'KHÁC'; // khu của nhóm: trường `area` trong group.json (kịch bản nhóm khai `area`)
const flowWarnings = [];
const groupFlows = {}; // gid -> [{id, title, order, screens}]
const screenFlow = {}; // stem -> {id, title, order}
for (const gid of Object.keys(flowsCfg)) {
  if (!groups.some((g) => g.id === gid)) throw new Error(`flows.json: nhóm "${gid}" không có trong project/snapshots`);
}
for (const g of groups) {
  const stems = g.allStems;
  const flows = (flowsCfg[g.id] || []).map((f, i) => ({ id: f.id, title: f.title, order: i + 1, screens: f.screens }));
  const seen = new Set();
  for (const f of flows) {
    if (!f.id || !f.title || !Array.isArray(f.screens)) throw new Error(`flows.json: luồng sai định dạng trong nhóm ${g.id}: ${JSON.stringify(f).slice(0, 80)}`);
    for (const stem of f.screens) {
      if (!stems.has(stem)) throw new Error(`flows.json: nhóm ${g.id}, luồng "${f.id}" có stem không tồn tại: ${stem}`);
      if (seen.has(stem)) throw new Error(`flows.json: nhóm ${g.id}, stem ${stem} nằm trong nhiều luồng`);
      seen.add(stem);
      if (excludeSet.has(stem)) continue;
      screenFlow[stem] = { id: f.id, title: f.title, order: f.order };
    }
  }
  const rest = g.screens.filter((s) => !seen.has(s.stem));
  if (rest.length) {
    const order = flows.length + 1;
    flows.push({ id: DEFAULT_FLOW_ID, title: DEFAULT_FLOW_TITLE, order, screens: rest.map((s) => s.stem) });
    for (const s of rest) screenFlow[s.stem] = { id: DEFAULT_FLOW_ID, title: DEFAULT_FLOW_TITLE, order };
    flowWarnings.push(`${g.id}: ${rest.length} màn chưa có trong flows.json (-> KHÁC): ${rest.map((s) => s.stem).join(', ')}`);
  }
  groupFlows[g.id] = flows.map((f) => ({ ...f, screens: f.screens.filter((x) => !excludeSet.has(x)) })).filter((f) => f.screens.length).map((f) => ({ id: f.id, title: f.title, order: f.order, screens: f.screens }));
}

// order + title của MỌI nhóm đã chụp (kể cả nhóm không nhúng ở lô này) để plugin xếp lại nhóm dựng từ lượt trước.
const groupOrders = Object.fromEntries(groups.map((g) => [g.id, { order: g.order, title: g.title, area: areaOf(g), flows: groupFlows[g.id].map(({ id, title, order }) => ({ id, title, order })) }]));

// screenFlows + groupOrders luôn gồm MỌI màn/nhóm đã chụp (đã áp exclude), dù build lô nào: plugin xếp lại cả nhóm dựng từ lô trước,
// thiếu màn ở đây thì màn của nhóm ngoài lô rơi vào luồng KHÁC.
const screenFlows = Object.fromEntries(groups.flatMap((g) => g.screens.map((s) => [s.stem, screenFlow[s.stem]])));

const flag = process.argv.indexOf('--groups');
const wanted = flag > 0 ? (process.argv[flag + 1] || '').split(',').map((x) => x.trim()).filter(Boolean) : null;
if (wanted) {
  const unknown = wanted.filter((id) => !groups.some((g) => g.id === id));
  if (!wanted.length || unknown.length) throw new Error(`--groups: không có nhóm ${unknown.join(', ') || '(trống)'}. Nhóm đã chụp: ${groups.map((g) => g.id).join(', ')}`);
  groups.splice(0, groups.length, ...groups.filter((g) => wanted.includes(g.id)));
}

const keep = new Set(groups.map((g) => `${g.id}.gen.json`));
for (const f of fs.readdirSync(DATA)) if (f.endsWith('.gen.json') && !keep.has(f)) fs.rmSync(path.join(DATA, f));

for (const g of groups) {
  const missing = g.screens.filter((s) => !fs.existsSync(path.join(SNAP, g.id, `${s.stem}.json`)));
  if (missing.length) throw new Error(`Nhóm ${g.id} thiếu snapshot: ${missing.map((s) => s.stem).join(', ')}`);
  const spec = { kind: 'snapshot-dir', dir: `../../snapshots/${g.id}`, registry: 'SNAP_SNAPSHOTS', index: 'SNAP_GROUPS', ...(g.excluded.length ? { exclude: g.excluded } : {}) };
  fs.writeFileSync(path.join(DATA, `${g.id}.gen.json`), JSON.stringify(spec, null, 2) + '\n');
}

const plan = {
  items: groups.map((g) => ({ title: g.title, desc: `${g.screens.length} trạng thái màn` })),
  screenIds: groups.flatMap((g) => g.screens.map((s) => s.stem)),
  themes: ['light'],
  groupOrders,
  screenFlows,
  replace: true,
};
fs.writeFileSync(path.join(KIT_ROOT, 'project/draft-plan.json'), JSON.stringify(plan, null, 2) + '\n');
console.log(`Đã sinh plan: ${groups.length} nhóm, ${plan.screenIds.length} màn.`);
for (const g of groups) console.log(`  ${g.id} · ${g.title} · ${g.screens.length} màn`);
console.log(`Loại theo project/exclude.json: ${groups.reduce((n, g) => n + g.excluded.length, 0)} màn${wanted ? ' (trong các nhóm đã chọn)' : ''}.`);
for (const g of groups) if (g.excluded.length) console.log(`  ${g.id}: -${g.excluded.length}`);
for (const w of excludeWarnings) console.warn(`CẢNH BÁO ${w}`);
for (const w of flowWarnings) console.warn(`CẢNH BÁO flows: ${w}`);

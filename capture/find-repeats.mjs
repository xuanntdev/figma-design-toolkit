// Tìm khối LẶP giữa nhiều màn để chọn khối nào cần thành component (trước khi viết luật link): băm cấu trúc cây con của snapshot
// (loại node, tên, nền / viền / bo / bóng, kiểu chữ, con) bỏ qua chữ dữ liệu, vị trí và kích thước; in bảng khối xuất hiện ở >= N màn.
// Chạy: node capture/find-repeats.mjs [--dir project/snapshots] [--min-screens 5] [--min-nodes 3] [--top 40] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { KIT_ROOT } from './lib/env.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ROOT = path.resolve(KIT_ROOT, opt('--dir', 'project/snapshots'));
const MIN_SCREENS = Number(opt('--min-screens', 5));
const MIN_NODES = Number(opt('--min-nodes', 3));
const TOP = Number(opt('--top', 40));

function sigOf(n) {
  if (n.k === 't') return 't:' + [n.fs, n.fw, n.col].join(',');
  if (n.k === 's') return 's';
  if (n.k === 'i') return 'i';
  return 'f:' + [n.n, n.bg, n.ba, JSON.stringify(n.r), n.bd ? n.bd.c : '', (n.sh || []).length].join(',');
}

// Băm một cây con; ghi vào `table` mọi frame đủ lớn kèm tập màn chứa nó.
function hashNode(n, table, stem) {
  const kids = (n.c || []).map((c) => hashNode(c, table, stem));
  const key = sigOf(n) + '(' + kids.map((k) => k.key).join('|') + ')';
  const size = 1 + kids.reduce((s, k) => s + k.size, 0);
  const text = n.k === 't' ? n.s : (kids.map((k) => k.text).find(Boolean) || '');
  if (n.k === 'f' && size >= MIN_NODES) {
    const e = table.get(key) || { key, size, screens: new Set(), count: 0, name: n.n, text, w: n.w, h: n.h };
    e.screens.add(stem);
    e.count += 1;
    table.set(key, e);
  }
  return { key, size, text };
}

function scan() {
  const table = new Map();
  for (const group of fs.readdirSync(ROOT)) {
    if (!fs.statSync(path.join(ROOT, group)).isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(ROOT, group))) {
      if (file === 'group.json' || !file.endsWith('.json')) continue;
      const snap = JSON.parse(fs.readFileSync(path.join(ROOT, group, file), 'utf8'));
      snap.children.forEach((c) => hashNode(c, table, snap.stem));
    }
  }
  return [...table.values()].filter((e) => e.screens.size >= MIN_SCREENS);
}

// Chỉ giữ khối "lớn nhất": bỏ khối nằm trọn trong khối cha lặp cùng số màn.
function maximal(list) {
  return list.filter((e) => !list.some((o) => o !== e && o.size > e.size && o.screens.size >= e.screens.size && o.key.includes(e.key)));
}

const rows = maximal(scan()).sort((a, b) => (b.screens.size * b.size) - (a.screens.size * a.size));
console.log('màn\tlần\tnode\ttên\tchữ mẫu\tcỡ');
rows.slice(0, TOP).forEach((e) => console.log([e.screens.size, e.count, e.size, e.name, JSON.stringify(e.text).slice(0, 40), Math.round(e.w) + 'x' + Math.round(e.h)].join('\t')));
if (opt('--json', '')) {
  fs.writeFileSync(opt('--json'), JSON.stringify(rows.map((e) => ({ screens: e.screens.size, count: e.count, nodes: e.size, name: e.name, text: e.text, w: e.w, h: e.h })), null, 1));
}

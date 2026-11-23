// Ví dụ engine link (4/4) — LUẬT khớp node snapshot với component. Snapshot đặt tên node theo `thẻ.class đầu` (vd `span.tag`, `button`, `header`),
// nên luật chỉ cần so tên + vài thuộc tính chắc chắn (nền, màu chữ, số con). Trả null khi không chắc: node dựng thành khối thô và được thống kê "chưa liên kết".
//   rule.match(node, ctx) -> { comp, variant?, props?, swaps?, nested?, radius?, name? } | null      (một node)
//   rule.matchRun(list, i, ctx) -> { link, span, box: {x, y, w, h} } | null                          (một đoạn anh em liên tiếp, vd thanh phân trang)
// `comp` là khoá plugin data của component (xem 47-link-comps.js); `variant` chọn biến thể; `props` đặt text/boolean property theo tên gốc.
const lkxKids = (n) => n.c || [];
const lkxTextKids = (n) => lkxKids(n).filter((c) => c.k === 't');
const lkxIs = (n, re) => n.k === 'f' && re.test(n.n || '');

function lkxButtonRule(n) {
  const texts = lkxTextKids(n);
  if (!lkxIs(n, /^button(\.btn)?$/) || texts.length !== 1 || lkxKids(n).length !== 1) return null;
  const type = n.bg === '#2563eb' && !n.bd ? 'primary' : (n.bg === '#ffffff' && n.bd ? 'default' : null);
  return type ? { comp: 'button', variant: { Type: type }, props: { Label: texts[0].s }, name: 'Button' } : null;
}

const LKX_TONES = { '#e0ecff|#2563eb': 'blue', '#f0f2f5|#4b5567': 'neutral' }; // nền|màu chữ -> Tone

function lkxTagRule(n) {
  const texts = lkxTextKids(n);
  if (!lkxIs(n, /^(span|a)\.tag$/) || texts.length !== 1 || n.bd) return null;
  const tone = LKX_TONES[n.bg + '|' + texts[0].col];
  return tone ? { comp: 'tag', variant: { Tone: tone }, props: { Label: texts[0].s }, name: 'Tag' } : null;
}

// Header: viền dưới + đúng 3 chữ (tiêu đề, 2 liên kết). Số liên kết khác thì không khớp chắc chắn -> khối thô.
function lkxHeaderRule(n) {
  const texts = lkxTextKids(n);
  const rest = lkxKids(n).filter((c) => c.k !== 't');
  if (!lkxIs(n, /^(header|nav)$/) || n.bg !== '#ffffff' || texts.length !== 3 || rest.length !== 1) return null;
  const props = { Title: texts[0].s, Link1: texts[1].s, Link2: texts[2].s };
  return { comp: 'app-header', variant: { State: 'default' }, props, name: 'App/Header' };
}

const LKX_RULES = [
  { name: 'button', match: lkxButtonRule },
  { name: 'tag', match: lkxTagRule },
  { name: 'app-header', match: lkxHeaderRule },
];

// Đăng ký vào extension snapshot (capture/extension/90-extension.js đọc SNAP_LINK).
Object.assign(SNAP_LINK, { linkRules: LKX_RULES, linkTokens: lkxTokens, buildTokens: lkxBuild });

// Engine link: thống kê độ phủ của một lượt Cập nhật (reset đầu lượt, trả về ở result.link) + hook updateDraft.
// nodes = node snapshot đã xử lý (cây con của instance tính trọn vào linked); tokens.<vai trò> = { bound, total } trên khối thô.
function lkNewStats() {
  return { nodes: 0, linked: 0, instances: 0, byComp: {}, byRule: {}, missing: {}, errors: {}, unmatched: {}, tokens: {}, miss: {} };
}

function lkStats() {
  if (!LK.stats) LK.stats = lkNewStats();
  return LK.stats;
}

function lkCountOf(n, ctx) {
  return ctx && ctx.count ? ctx.count(n) : 1;
}

function lkStatLinked(rule, link, n, ctx) {
  const s = lkStats();
  const c = lkCountOf(n, ctx);
  s.nodes += c;
  s.linked += c;
  s.instances += 1;
  s.byComp[link.comp] = (s.byComp[link.comp] || 0) + 1;
  s.byRule[rule] = (s.byRule[rule] || 0) + 1;
}

function lkStatRun(rule, link, nodes, ctx) {
  const s = lkStats();
  const c = nodes.reduce((sum, n) => sum + lkCountOf(n, ctx), 0);
  s.nodes += c;
  s.linked += c;
  s.instances += 1;
  s.byComp[link.comp] = (s.byComp[link.comp] || 0) + 1;
  s.byRule[rule] = (s.byRule[rule] || 0) + 1;
}

function lkStatFallback(n, ctx) {
  const s = lkStats();
  s.nodes += 1;
  const label = ctx && ctx.label ? ctx.label(n) : null;
  if (label) s.unmatched[label] = (s.unmatched[label] || 0) + 1;
}

function lkStatMissing(key) {
  const s = lkStats();
  s.missing[key] = (s.missing[key] || 0) + 1;
}

function lkStatError(rule) {
  const s = lkStats();
  s.errors[rule] = (s.errors[rule] || 0) + 1;
}

// Giá trị chưa có token (khoá màu / khoá text style) để biết nên bổ sung token nào.
function lkStatMiss(role, key) {
  const m = lkStats().miss;
  const r = m[role] = m[role] || {};
  r[key] = (r[key] || 0) + 1;
}

function lkStatToken(role, ok) {
  const t = lkStats().tokens;
  const r = t[role] = t[role] || { bound: 0, total: 0 };
  r.total += 1;
  if (ok) r.bound += 1;
}

const lkPct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function lkReport() {
  const s = lkStats();
  const tokens = {};
  Object.keys(s.tokens).forEach((k) => { tokens[k] = Object.assign({ pct: lkPct(s.tokens[k].bound, s.tokens[k].total) }, s.tokens[k]); });
  const top = Object.keys(s.unmatched).sort((a, b) => s.unmatched[b] - s.unmatched[a]).slice(0, 25).map((k) => ({ label: k, count: s.unmatched[k] }));
  const miss = {};
  Object.keys(s.miss).forEach((role) => {
    const r = s.miss[role];
    miss[role] = Object.keys(r).sort((a, b) => r[b] - r[a]).slice(0, 8).map((k) => k + ' ×' + r[k]);
  });
  return {
    active: lkActive(), tokenMiss: miss, components: Object.keys(LK.comps).length, nodes: s.nodes, linked: s.linked, linkedPct: lkPct(s.linked, s.nodes),
    instances: s.instances, byComp: s.byComp, byRule: s.byRule, missing: s.missing, errors: s.errors, tokens, unmatchedTop: top,
  };
}

const LK_HOOK_UPDATE = PLUGIN_COMMANDS.updateDraft;

async function lkHookUpdateDraft(args) {
  LK.stats = lkNewStats();
  const result = await LK_HOOK_UPDATE(args);
  if (lkActive()) result.link = lkReport();
  return result;
}

PLUGIN_COMMANDS.updateDraft = lkHookUpdateDraft;

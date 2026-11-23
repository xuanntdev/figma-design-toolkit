// Hook trang "Token & Component": nếu extension khai báo DESIGN_EXTENSION.buildTokens(page) thì
//  - lệnh riêng `buildTokens` (nút "Token & Component" trong UI) chỉ làm mới trang này;
//  - mỗi lượt `updateDraft` (Cập nhật) làm mới trang này TRƯỚC khi dựng màn, rồi commit undo riêng
//    để Hoàn tác chỉ gỡ khung màn vừa dựng, không gỡ token. Lỗi token không làm hỏng lượt dựng màn (báo ở kết quả `tokens`).
// Extension không khai buildTokens thì hook là no-op (không tạo trang).

function tokHookBuilder() {
  const ext = typeof DESIGN_EXTENSION === 'undefined' ? null : DESIGN_EXTENSION;
  return ext && typeof ext.buildTokens === 'function' ? ext.buildTokens : null;
}

async function tokHookRun(args) {
  const build = tokHookBuilder();
  if (!build) return { skipped: true };
  try {
    assertCanWrite(args);
    const page = await stEnsurePage(stOpts(args).pageTokens);
    const value = await build(page);
    stampFile();
    figma.commitUndo();
    return Object.assign({ ok: true }, value);
  } catch (err) {
    return { ok: false, error: (err && err.message) ? err.message : String(err) };
  }
}

async function tokHookBuildTokens(args) {
  const r = await tokHookRun(args);
  if (r.skipped) throw new Error('Extension chưa có buildTokens nên không dựng được trang Token & Component.');
  if (r.ok === false) throw new Error(r.error);
  return r;
}

const TOK_HOOK_UPDATE = PLUGIN_COMMANDS.updateDraft;

async function tokHookUpdateDraft(args) {
  const tokens = await tokHookRun(args);
  const result = await TOK_HOOK_UPDATE(args);
  result.tokens = tokens;
  return result;
}

PLUGIN_COMMANDS.buildTokens = tokHookBuildTokens;
PLUGIN_COMMANDS.updateDraft = tokHookUpdateDraft;

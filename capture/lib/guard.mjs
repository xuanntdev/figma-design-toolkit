// CHỈ ĐỌC: chặn mọi request ghi (POST/PUT/PATCH/DELETE) của trang đang chụp và ghi lại để báo cáo.
// Phiên đăng nhập đã có sẵn (CAPTURE_STORAGE_STATE) nên lúc chụp không cần ghi gì.
export const blocked = [];

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function installReadOnlyGuard(context) {
  await context.route('**/*', (route) => {
    const req = route.request();
    if (SAFE.has(req.method())) return route.continue();
    blocked.push(`${req.method()} ${new URL(req.url()).pathname}`);
    return route.abort('blockedbyclient');
  });
}

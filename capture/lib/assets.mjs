// Nạp ảnh nền CSS (background-image: url) thành ảnh/SVG nhúng; ngoài giới hạn thì thành ô xám.
const LIMIT = 120000;

export async function resolveBgImages(page, snap) {
  const todo = [];
  const visit = (nodes) => (nodes || []).forEach((n) => { if (n.bi) todo.push(n); visit(n.c); });
  visit(snap.children);
  for (const n of todo) {
    const src = n.bi;
    delete n.bi;
    try {
      if (src.startsWith('data:image/svg+xml')) {
        snap.svgs.push(decodeURIComponent(src.split(',').slice(1).join(',')));
        put(n, 's', snap.svgs.length - 1);
        continue;
      }
      const res = await page.request.get(new URL(src, page.url()).toString(), { timeout: 8000 });
      const type = res.headers()['content-type'] || '';
      const body = await res.body();
      if (type.includes('svg')) {
        snap.svgs.push(body.toString('utf8'));
        put(n, 's', snap.svgs.length - 1);
      } else if (/png|jpe?g|gif/.test(type) && body.length < LIMIT) {
        snap.imgs.push(`data:${type};base64,${body.toString('base64')}`);
        put(n, 'i', snap.imgs.length - 1);
      } else if (!n.bg) {
        n.bg = '#E5E7EB';
      }
    } catch {
      if (!n.bg) n.bg = '#E5E7EB';
    }
  }
}

function put(n, k, v) {
  n.c = [{ k, n: 'bg-image', x: 0, y: 0, w: n.w, h: n.h, v }, ...(n.c || [])];
}

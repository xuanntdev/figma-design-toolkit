// Nhóm mẫu chạy được ngay trên trang tĩnh capture/sample-site (không cần đăng nhập): `node capture/capture.mjs sample`.
// Tạo nhóm của dự án: sao chép file này thành groups/<group-id>.mjs (id phải trùng tên file), đổi route/selector.
//   id     mã nhóm, dùng làm tiền tố stem (`<id>-<stem>`) và tên thư mục project/snapshots/<id>/
//   title  tên nhóm hiện trên canvas (nên có số thứ tự: "1 · Đơn hàng")
//   order  thứ tự nhóm; area (tuỳ chọn) = khu chứa nhóm trên canvas (Section cấp 1)
// API ctx: goto(route), snap(stem, title, {fit}), step(name, fn), click(locator, label?), openModal(locator),
//          tab(name), overlay(), closeTop(), settle(), page (Playwright Page).
export default {
  id: 'sample',
  title: '1 · Trang mẫu',
  order: 1,
  area: 'MẪU',
  async run(ctx) {
    await ctx.step('danh-sach', async () => {
      await ctx.goto('/');
      await ctx.snap('danh-sach', 'Đơn hàng · Danh sách');
    });
    await ctx.step('chi-tiet', async () => {
      await ctx.goto('/');
      await ctx.openModal(ctx.page.getByRole('button', { name: 'Xem chi tiết' }));
      await ctx.snap('chi-tiet', 'Đơn hàng · Chi tiết (hộp thoại)', { fit: false });
      await ctx.closeTop();
    });
  },
};

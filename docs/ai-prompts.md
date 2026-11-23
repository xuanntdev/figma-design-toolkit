# Mẫu prompt cho AI dựng màn hình

> Mọi prompt dưới đây ngầm yêu cầu tuân [nguyen-tac.md](nguyen-tac.md): dựng màn từ component dùng chung, token theo chuẩn Figma, không phá phần người đã sửa.

## 1. Dựng màn mới từ mã nguồn app + ảnh chụp

> Đọc màn hình `<Tên màn>` trong mã nguồn (`<đường dẫn file>`) và ảnh chụp đính kèm.
> Dựng module JavaScript trong `project/extension/` (≤ 300 dòng/file, ≤ 40 dòng/hàm) hỗ trợ cả Sáng và Tối, dùng Auto Layout, chữ sửa được, tách dữ liệu khỏi mã dựng và đạt tương phản WCAG ≥ 4.5:1.
> Cập nhật `project/draft-plan.json` với `screenIds` và mô tả các nhóm mục tiêu, chạy `python design_sync.py build` và `python design_sync.py check` ở thư mục gốc kit, rồi báo để mình bấm **Cập nhật** trong plugin của dự án (tên ở `name` trong `project/design-sync.json`) trên Figma Desktop.
> Cỡ khung lấy từ `ST_GRID.cellW` / `ST_GRID.cellH` (theo `frame` trong `project/design-sync.json`), không ghi cứng số.

## 2. Chỉnh sửa bản nháp sau khi duyệt trên Figma

> Trên màn `<screenId>` (Sáng/Tối), sửa các điểm sau:
> 1. `<Mô tả thay đổi 1>`
> 2. `<Mô tả thay đổi 2>`
> Sửa builder trong `project/extension/`, chỉ giữ `<screenId>` trong `project/draft-plan.json`, build lại và kiểm `design_sync.py check` để mình bấm **Cập nhật**.

## 3. Chụp giao diện Web bằng Playwright làm đầu vào

> Dùng `docs/capture-web.mjs` chụp route `<URL>` (viewport tự lấy theo `frame` trong `project/design-sync.json`) cho cả Sáng và Tối, kết hợp đọc DOM/CSS để dựng lại thành builder trong `project/extension/` rồi build plugin.

## 4. Đồng bộ ngược từ Figma

> Xem designer đã sửa gì trên Figma rồi hỏi mình xử lý. Chỉ ĐỌC Figma: không xoá, không ghi đè phần designer đã sửa. Mọi lệnh chạy ở thư mục gốc kit.
> 1. Đọc `readAt` trong `project/figma-state/index.json`; thiếu hoặc cũ thì chạy `python design_sync.py pull` (cần cửa sổ plugin của dự án đang mở trong Figma Desktop; file lớn thêm `--timeout 180`). `pull` thất bại thì nhờ mình mở plugin rồi chạy lại, hoặc bấm **Xuất trạng thái** rồi `python design_sync.py import-state <tệp>`.
> 2. Chạy `python design_sync.py figma-diff` (`--json` nếu cần xử lý tiếp) và tóm tắt theo từng màn: chữ thêm/bớt, đổi component/variant/property, đổi màu/token, node thêm/bớt, khung vẽ tay không có trong repo, màn plan chưa có trên Figma, token/component lệch bảng của extension. Màn `untouched` không cần nhắc; `repoChanged` nghĩa là nguồn repo đã đổi sau lần dựng (cần bấm **Cập nhật**, không phải sửa tay).
> 3. Với mỗi nhóm thay đổi (màn / token / component / khung vẽ tay), hỏi mình chọn một: **(a)** chốt làm mốc mới (chỉ ghi nhận, `git add project/figma-state` khi mình bảo commit); **(b)** là yêu cầu sửa UI của app (chỉ LIỆT KÊ thay đổi đề xuất: màn, chỗ đổi, trước/sau; không sửa code app khi chưa được duyệt riêng); **(c)** cập nhật `project/extension/` (token, component, luật link) cho khớp Figma, rồi `build` + `check`.
> Chưa được mình chọn thì chỉ báo cáo, không làm gì thêm.

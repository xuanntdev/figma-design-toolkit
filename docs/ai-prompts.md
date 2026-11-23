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

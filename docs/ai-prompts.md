# Mẫu prompt cho AI dựng màn hình

> Mọi prompt dưới đây ngầm yêu cầu tuân [nguyen-tac.md](nguyen-tac.md): dựng màn từ component dùng chung, token theo chuẩn Figma, không phá phần người đã sửa.

## 1. Dựng màn theo Figma

> Dựng màn `<Tên màn>` trên page đang chọn. Đọc thiết kế và thư viện của file Figma đã kết nối. Nếu mình không gửi ảnh thì dùng style, token và component hiện có. Nếu ảnh gần giống màn trong file thì lấy màn đó làm nền và sửa phần khác biệt. Nếu ảnh khác rõ thì dựng bám ảnh, sử dụng các layer chỉnh sửa được. Tạo và đặt tên màn trực tiếp trong Figma.

## 2. Chỉnh selection hoặc một nhóm màn

> Đổi chữ nút đang chọn thành “Xác nhận”. Sửa tại chỗ rồi đọc lại kết quả.

> Áp dụng cùng thay đổi cho các màn Checkout. Liệt kê từng màn, thay đổi và đích bị cấm, rồi chờ mình bấm **Cập nhật**.

## 3. Chụp giao diện Web bằng Playwright làm đầu vào

> Dùng `docs/capture-web.mjs` chụp route `<URL>` (viewport tự lấy theo `frame` trong `project/design-sync.json`) cho cả Sáng và Tối, kết hợp đọc DOM/CSS để dựng lại thành builder trong `project/extension/` rồi build plugin.

## 4. Đồng bộ ngược từ Figma

> Đọc frame mình đang chọn trên Figma, xuất một PNG vào thư mục tạm và cho mình biết tên frame cùng đường dẫn ảnh.

> Xem designer đã sửa gì trên Figma rồi hỏi mình xử lý. Chỉ ĐỌC Figma: không xoá, không ghi đè phần designer đã sửa. Mọi lệnh chạy ở thư mục gốc kit.
> 1. Đọc `readAt` trong `project/figma-state/index.json`. Nếu thiếu hoặc cũ, chạy `python design_sync.py pull` khi cửa sổ plugin đang mở trong Figma Desktop. File lớn có thể thêm `--timeout 180`. Nếu đã có snapshot JSON, dùng `python design_sync.py import-state <tệp>`.
> 2. Chạy `python design_sync.py figma-diff` (`--json` nếu cần xử lý tiếp) và tóm tắt theo từng màn: chữ thêm/bớt, đổi component/variant/property, đổi màu/token, node thêm/bớt, khung vẽ tay không có trong repo, màn plan chưa có trên Figma, token/component lệch bảng của extension. Màn `untouched` không cần nhắc; `repoChanged` nghĩa là nguồn repo đã đổi sau lần dựng (cần bấm **Cập nhật**, không phải sửa tay).
> 3. Với mỗi nhóm thay đổi (màn / token / component / khung vẽ tay), hỏi mình chọn một: **(a)** chốt làm mốc mới (chỉ ghi nhận, `git add project/figma-state` khi mình bảo commit); **(b)** là yêu cầu sửa UI của app (chỉ LIỆT KÊ thay đổi đề xuất: màn, chỗ đổi, trước/sau; không sửa code app khi chưa được duyệt riêng); **(c)** cập nhật `project/extension/` (token, component, luật link) cho khớp Figma, rồi `build` + `check`.
> Chưa được mình chọn thì chỉ báo cáo, không làm gì thêm.

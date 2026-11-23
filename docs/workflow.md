# Quy ước làm việc Hiện tại / Cải tiến

## 1. Hai chế độ trang trên Figma

- **File có sẵn Section (khuyên dùng cho dự án đang chạy):** Trang màn hình có hai Section cùng cấp **Hiện tại** và **Cải tiến**, bên trong chia theo **Sáng / Tối → Nhóm tính năng → Frame màn hình**. Plugin đọc **Hiện tại** (chỉ đọc) để gương đúng tên nhóm, vị trí ô, màu nền, viền và bo góc sang **Cải tiến**.
- **File nháp mới:** Plugin tự tạo trang **Tính năng** gồm hai khung **Hiện tại** và **Cải tiến** đặt song song, thẳng hàng ngang theo từng màn hình.

Màn dựng bằng code vào khung nào do `target` trong `design-sync.json` quyết định:
- `improved` (mặc định): vào **Cải tiến**. **Hiện tại** chỉ đọc (gương cấu trúc, nhận ảnh chụp).
- `current`: vẽ lại màn đang chạy thẳng vào **Hiện tại**. Thiếu vùng Sáng/Tối hoặc nhóm thì plugin tự tạo; khung mới xếp bên phải khung có sẵn, không đè lên khung vẽ tay hay ảnh chụp. **Cải tiến** không bị đụng.

## 2. Bảo vệ bản đã duyệt và phần chỉnh tay

Mỗi Frame do plugin tạo được gắn metadata:
- `screenId`: mã màn hình (trùng với `stem` trong `DESIGN_EXTENSION`).
- `theme`: `light` hoặc `dark`.
- `source`: `ai` (nháp tự dựng) hoặc `human` (designer tự tạo/chỉnh).
- `status`: `draft` (nháp) hoặc `chosen` (đã duyệt).

Khi bấm **Cập nhật**:
1. Plugin kiểm tra đủ toàn bộ đích đến **trước khi ghi** bất kỳ node nào. Nếu sai trang hoặc thiếu nhóm, dừng ngay và báo lỗi.
2. Chỉ thay các bản nháp `source=ai` chưa duyệt (`status!=chosen`) của đúng `screenId + theme` nằm trong `draft-plan.json`.
3. Bản `status=chosen` hoặc `source=human` được **giữ nguyên**, bản nháp mới đặt cạnh nó để so sánh.
4. Các màn ngoài danh sách không bao giờ bị đụng tới. Khu **Hiện tại** cũng vậy, trừ khi `target=current`: khi đó chỉ thay bản nháp `source=ai` của chính màn đó, khung vẽ tay và ảnh chụp giữ nguyên.

## 3. Hoàn tác an toàn

- Nút **Hoàn tác** mặc định bị khoá khi mở plugin để không hoàn tác nhầm thao tác chỉnh tay trước đó trên Figma.
- Nút chỉ mở sau khi bấm **Cập nhật** tạo khung mới thành công, gỡ đúng lượt vừa chạy và tự khoá lại ngay sau khi hoàn tác.

---
name: figma-design
description: Set up this Figma Design Toolkit, read the connected Figma selection and design system, create or edit native screens, stage bulk edits, and manage toolkit write protection on pages.
---

# Thiết kế trong file Figma đã ghép

## Xác định dự án

- Chỉ dùng plugin Development của toolkit trong Figma Desktop để truy cập thiết kế. Hướng dẫn người dùng vào **Plugins → Development → Import plugin from manifest…** và chọn `project/dist/manifest.json`. Kết nối bằng CLI của toolkit qua `localhost`. Không gọi Figma REST API, không dùng Figma MCP và không yêu cầu access token Figma.
- Repo dự án là bản clone của kit. Cấu hình nằm ở `project/design-sync.json`; chạy `python design_sync.py <lệnh>` từ gốc repo.
- Với repo chỉ có kit, chạy `python design_sync.py init --name "<tên dự án>"`, `build` và `doctor`. Giữ cấu hình khi dự án đã được khởi tạo. Cách thiết lập repo riêng có ở [hướng dẫn setup](../../../docs/setup.md).
- Giữ một plugin cho mỗi dự án. Dùng cùng ID và đường dẫn manifest cho việc ghép file, dựng màn và duyệt lô. Khi đổi kế hoạch builder, chạy `build --plan <tệp>` và mở lại plugin đã import.

## Đọc thiết kế

- Chạy `doctor` để lấy đường dẫn manifest và trạng thái ghép file. Khi cần thao tác Figma Desktop, hướng dẫn người dùng mở plugin trong đúng file để tự kết nối. Nếu đã ngắt kết nối thủ công, bấm **Kết nối file** để ghép lại. Kiểm lại tên file và phiên bằng CLI.
- Xác định ý định và đích từ câu chat. Ưu tiên đích được nêu rõ. Khi câu chat chỉ đối tượng bằng “màn này”, “nút đang chọn” hoặc cách nói tương tự, gọi `selection` để đọc selection mới rồi dùng `tree <node-id> --session <id>` nếu cần. Bỏ qua selection khi câu chat hỏi việc khác hoặc đã chỉ rõ đích khác. Nếu selection trống hoặc có nhiều đích phù hợp mà yêu cầu chưa xác định được phạm vi, hỏi lại để làm rõ đích.
- Với câu hỏi như “nút này dùng token màu gì?”, chỉ đọc và trả lời. Việc chọn layer chỉ cung cấp ngữ cảnh, mọi thao tác ghi phải xuất phát từ yêu cầu tạo hoặc sửa của người dùng. Khi cần hiểu cả file, chạy `pull` và đọc index, screens, components và tokens trong `figma-state/` của dự án. Đối chiếu phiên kết nối với `documentSession` trước khi dùng ID từ bản xuất để ghi.
- Khi cần đọc giao diện Figma bằng ảnh, dùng `export-png <node-id> --session <id> --out <ảnh-tạm>`. Đọc thêm cây layer khi cần style, binding và kích thước.

## Dựng và sửa

- Khi dựng hoặc rà cả Sáng và Tối, đọc [cách dùng biến và biến thể theo vai trò](../../../docs/workflow.md#bề-mặt-trong-sáng-và-tối). Chọn variant và token theo mục đích của khối, kể cả khi hai vai trò trùng mã màu trong một mode. Đọc lại binding, xuất ảnh cả hai mode và kiểm tương phản chữ phụ trên nền thẻ thực tế.
- Không gửi ảnh thì tham chiếu màn cùng luồng và dùng lại style, token và component của Figma. Ảnh gần giống một màn hiện có thì nhân bản màn làm nền và sửa phần khác biệt. Với ảnh khác rõ, dùng hình ảnh làm yêu cầu về bố cục và hình thức, dựng ra layer có thể chỉnh và dùng lại thành phần phù hợp. Dùng bản xuất Figma đã đọc khi chuẩn bị offline. Ảnh local/capture dùng khi người dùng chỉ định.
- Ghi ngay khi plugin đang kết nối, page cho ghi và yêu cầu xác định được một item/màn hoặc tạo màn. Đọc lại đích sau khi ghi. Tạo màn với `create`, sửa tại chỗ với `edit`. Tài liệu JSON ở [Figma trực tiếp](../../../docs/figma-live.md).
- Trước khi sửa component hoặc token chung, xem `impact`. Khi sửa hàng loạt, dùng `stage`, đưa người dùng danh sách cụ thể, rồi chờ họ bấm **Cập nhật** trong Figma. Báo kết quả qua `status` khi cần. Nếu chạm page bị cấm, báo đích và chỉ gỡ cấm khi người dùng yêu cầu.

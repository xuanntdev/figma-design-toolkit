# Nguyên tắc thiết kế khi sinh màn lên Figma

Áp dụng cho mọi dự án dùng kit: người viết extension, AI sinh màn và người review đều theo bộ nguyên tắc này.
Mục **bắt buộc** là phần lõi của kit; các mục còn lại là cấu hình mặc định khuyến nghị, đổi được trong `design-sync.json` (xem [setup.md](setup.md)).

> Trạng thái: một số mục đang được hiện thực dần trong lõi (ghi chú *đang làm*). Tài liệu này là đích đến; khi mã chưa theo kịp, theo tài liệu.

## 1. Bắt buộc: dựng màn từ component dùng chung

- Màn sinh ra phải **ghép từ instance** của component trong thư viện của file (trang Token & Component), không vẽ lại khối rời cho từng màn. Sửa component/token một chỗ thì mọi màn đổi theo.
- Mọi node đi qua bộ liên kết của lõi: khớp luật → tạo instance đúng variant, gán thuộc tính (chữ, icon, bật/tắt); **chỉ khi không luật nào khớp** mới dựng khối thường, và khối đó được thống kê là "chưa liên kết" để bổ sung luật. Không có cờ tắt việc liên kết. *(đang làm)*
- Khối **lặp lại giữa nhiều màn** phải là component: khung ứng dụng (thanh điều hướng, header, breadcrumb), thanh bộ lọc/tìm kiếm, card (tiêu đề + hành động), bảng (header, dòng, chân), phân trang, header/footer hộp thoại, khối nhãn–giá trị, lịch sử thao tác, trạng thái rỗng, nút nổi… Quét các màn để tìm khối lặp (≥5 màn) trước khi viết luật.
- Phần riêng của từng dự án chỉ là **bộ luật khớp** (vd theo class của thư viện UI đang dùng) khai báo ở extension; bộ liên kết ở lõi không biết gì về thư viện UI cụ thể.
- Thư viện chưa có trong file thì lượt Cập nhật dựng trang Token & Component trước rồi mới dựng màn.

## 2. Token theo chuẩn design system của Figma

- Một bộ token dùng chung, chia collection: **Primitives** (màu thô theo thang `blue/50…900`, scopes rỗng – ẩn khỏi picker) → **Color** (biến ngữ nghĩa `color/bg/*`, `color/text/*`, `color/border/*`… là **alias** tới Primitives, không lặp giá trị thô) + **Spacing**, **Radius**, **Typography**.
- Mọi biến có **scopes** đúng loại (nền `FRAME_FILL, SHAPE_FILL`; chữ `TEXT_FILL`; viền `STROKE_COLOR`; khoảng cách `GAP`; bo góc `CORNER_RADIUS`) — không bao giờ `ALL_SCOPES`.
- Mọi biến có **code syntax** WEB dạng `var(--tên-biến-css-thật)` theo mã nguồn sản phẩm.
- Text style đặt tên theo vai trò (`Heading/H1`, `Body/Medium`, `Caption/Regular`…), cỡ chữ/line-height bám biến Typography.
- Màu, chữ, bo góc, khoảng cách trên màn khớp token thì **gắn biến/style**, không ghi giá trị thô.

## 3. Component theo chuẩn của Figma

- Tên variant `Property=Value` (vd `Size=Medium, Style=Primary, State=Default`); mỗi set **≤ 30 tổ hợp**, vượt thì tách sub-component.
- Icon là component riêng, đổi bằng **INSTANCE_SWAP**; không tạo variant theo từng icon. Dùng boolean (`Show icon`) và text property (`Label`, `Title`) thay vì nhân variant.
- Fill, viền, padding, khoảng cách, bo góc **bind vào biến**; trừ hình học cố định (cỡ icon).
- Variant xếp lưới, không chồng nhau; mô tả cách dùng ở `description`.
- Ưu tiên khớp chuẩn hơn khớp từng pixel sản phẩm; lệch nhỏ ghi lại để sửa sau.

## 4. Không phá phần con người đã làm

- Không xoá/ghi đè khung do người sửa tay, khung đã duyệt hay node không do plugin tạo. Không chắc khung đã bị sửa hay chưa → **giữ** và báo.
- Không khuyến khích xoá hàng loạt nội dung file để "dựng lại cho sạch" — file có thể đã có người chỉnh.
- Mỗi lượt ghi là một bước hoàn tác; nút Hoàn tác gỡ được cả lượt.
- Khi bật đồng bộ kiểu git (`sync: "merge"`): so base (bản dựng lần trước) / Figma hiện tại / nguồn mới; chỉ một phía đổi thì lấy phía đó, cả hai đổi là **xung đột** để người quyết.

## 5. Gọn cho người xem

- Bước Xem trước chỉ liệt kê thứ **sẽ bị ghi** (dựng mới / thay / xung đột); thứ không đụng tới không đếm.
- Ít cấp Section: thường **nhóm → luồng → màn** là đủ; nhóm chỉ có một luồng thì bỏ cấp luồng; lớp ngoài cùng nên trong suốt.
- Không vẽ nhãn chữ trùng với tên khung Figma đã hiển thị; tên khung `mã · tên màn` là đủ.
- Không đưa màn trùng: màn chỉ khác dữ liệu, chỉ khác tag trạng thái, hay trạng thái của component chung (chọn ngày, cột hiển thị, số dòng/trang…) thì loại khỏi plan, ghi lý do.
- Thứ tự nhóm theo menu của sản phẩm.

## 6. Thu thập giao diện an toàn (khi dùng `capture/`)

- **Chỉ đọc**: chặn mọi request ghi; chỉ được mở hộp thoại để chụp, không bao giờ bấm gửi/lưu/duyệt.
- Chụp trên môi trường thử nghiệm, chạy ngầm (headless); vùng bản đồ/canvas/iframe chụp thành ảnh sau khi tải xong.

## 7. Kit chung trung lập

- Ngoài mục 1, mọi hành vi đều là tuỳ chọn cấu hình với mặc định giữ hành vi gốc của kit: dự án *sửa trực tiếp* trên màn đang chạy hay *sinh màn mới / bản đề xuất* đều dùng được.
- Không đưa tên dự án, dữ liệu, nghiệp vụ cụ thể vào kit chung.
- Mọi thao tác ghi vào Figma đi qua plugin cục bộ của dự án.

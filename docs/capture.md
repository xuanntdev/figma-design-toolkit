# Chụp web thành snapshot (công cụ tuỳ chọn)

Pipeline cho dự án có sẵn web chạy được: **Playwright chụp màn (chỉ đọc) → snapshot DOM (`project/snapshots/<nhóm>/`) → plugin dựng lại thành frame có text/khối/icon sửa được trong Figma**. Thư mục `capture/` độc lập với lõi kit; không dùng thì bỏ qua. Cần Node.js và `cd capture && npm install` (Playwright).

## Môi trường (biến môi trường)

| Biến | Ý nghĩa |
| --- | --- |
| `CAPTURE_BASE_URL` | URL gốc của web cần chụp. Bỏ trống = tự chạy trang tĩnh `capture/sample-site` (nhóm mẫu `sample`). |
| `CAPTURE_STORAGE_STATE` | Tuỳ chọn: tệp `storageState` của Playwright (cookie/localStorage đã đăng nhập) để chụp màn sau đăng nhập. Tạo bằng `context.storageState({ path })` sau khi tự đăng nhập một lần. Không commit tệp này. |
| `CAPTURE_HEADLESS` | `1` = chạy không giao diện; mặc định mở cửa sổ trình duyệt. |
| `CAPTURE_CHANNEL` | Mặc định `chrome` (Chrome cài sẵn); đặt rỗng để dùng Chromium của Playwright. |
| `CAPTURE_LOCALE` / `CAPTURE_TIMEZONE` | Mặc định `vi-VN` / `Asia/Ho_Chi_Minh`. |
| `CAPTURE_SPINNER_SELECTOR` / `CAPTURE_OVERLAY_SELECTOR` / `CAPTURE_LAYER_SELECTOR` | Selector chờ spinner, chờ modal/drawer hiện, đóng lớp phủ. Mặc định hỗ trợ Ant Design và `role=dialog`. |

**Chỉ đọc**: `capture/lib/guard.mjs` abort mọi POST/PUT/PATCH/DELETE; `ctx.click` từ chối nhãn Lưu/Gửi/Duyệt/Xác nhận/Xóa/Tạo/Cập nhật…; nút mang nhãn ghi chỉ được bấm bằng `ctx.openModal(locator)` để MỞ modal, chụp xong `ctx.closeTop()`, không bao giờ submit. Không tạo data, không hardcode mã bản ghi.

## Chụp một nhóm

1. Sao chép `capture/groups/sample.mjs` thành `capture/groups/<group-id>.mjs` (id trùng tên file), khai `id`, `title`, `order`, tuỳ chọn `area` (khu chứa nhóm), rồi viết `run(ctx)`: `ctx.goto(route)`, `ctx.snap(stem, title, {fit})`, `ctx.step(name, fn)` (tối đa 2 lượt, lỗi thì ghi report rồi đi tiếp), `ctx.click`, `ctx.openModal`, `ctx.tab`, `ctx.overlay`, `ctx.closeTop`, `ctx.settle`, `ctx.page`. `fit`: `true` = full-page (kéo cao viewport theo vùng cuộn), `'overlay'` = modal/drawer có thân cuộn, `false` = giữ viewport.
2. Chạy `node capture/capture.mjs <group-id>`: ghi `project/snapshots/<group-id>/{group.json, <stem>.json}` và ảnh PNG + `report.json` ở `captures/<group-id>/` (gitignore). Mỗi agent/người chụp một nhóm riêng nên không đụng nhau. `node capture/capture.mjs --list` liệt kê nhóm.
3. Soát nhanh không cần Figma: `node capture/preview.mjs <group-id> [stem…]` dựng lại snapshot thành HTML rồi chụp `<stem>.preview.png` để so với `<stem>.png`.
4. Dò màn trước khi viết kịch bản: `node capture/explore.mjs /route` (in tab/nút/cột bảng; `FIRST_ROW=1` để bấm dòng đầu bảng).

## Dựng bằng component (engine link, bắt buộc ở lõi)

Bộ dựng snapshot trong `capture/extension/` đưa mọi node qua engine link của lõi. Mặc định (chưa khai luật) màn dựng như trước: khối thô. Để dựng bằng component dùng chung, thêm các mô-đun luật + token vào extension của dự án:

```sh
cp capture/link-example/*.js project/extension/     # ví dụ: Button, Tag, App/Header khớp theo tên thẻ.class của trang mẫu
python design_sync.py build
```

Rồi viết luật cho khối của chính web mình (`linkRules` / `linkTokens` / `buildTokens`, xem [workflow.md](workflow.md) mục 5), dùng `node capture/find-repeats.mjs` để biết khối nào lặp nhiều nhất. Kết quả **Cập nhật** có `link` (độ phủ instance và token, phần tử chưa có luật).

## Sinh plan và build

Sau `init`, thay màn mẫu bằng bộ dựng snapshot có sẵn: `rm project/extension/01-screens.js && cp capture/extension/*.js project/extension/`. Rồi:

```sh
node capture/gen-plan.mjs            # project/snapshots/*/group.json → project/extension/data/<nhóm>.gen.json + project/draft-plan.json
python design_sync.py build          # code.js nhúng snapshot các nhóm có trong data/
python design_sync.py check
node verify_project.js               # chạy plugin trong Figma giả: dựng hết màn trong plan, thiếu font cũng không vỡ
```

- **Build theo nhóm**: `node capture/gen-plan.mjs --groups a,b` chỉ nhúng nhóm chọn (bundle nhẹ); nhóm khác trên Figma không bị đụng. Chạy lại không `--groups` trước khi commit `data/` + `draft-plan.json`.
- **Khu / luồng**: `area` lấy từ `group.json` (thiếu thì `KHÁC`). `project/flows.json` gán màn vào luồng con (Section lồng trong Section nhóm): `{ "<group-id>": [{ "id": "list", "title": "DANH SÁCH", "screens": ["<group-id>-danh-sach"] }] }`; stem không tồn tại hoặc nằm ở 2 luồng thì `gen-plan` báo lỗi, màn chưa gán vào luồng `KHÁC` kèm cảnh báo.
- **Loại màn**: `project/exclude.json` = `{ "exclude": [{ "stem": "...", "reason": "..." }] }`: snapshot vẫn nằm trên đĩa nhưng bị bỏ khỏi plan, luồng và bundle (`exclude` của kiểu `snapshot-dir`).
- Nhãn mã màn = `<order nhóm>.<số thứ tự màn trong group.json, 2 chữ số>`, nên đổi thứ tự/chèn màn giữa danh sách thì mã dời.

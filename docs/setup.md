# Cài đặt & cấu hình dự án

## Thiết lập cho team

Mỗi team **clone kit thành repo của team mình**. Màn của team nằm trong `project/`: `design-sync.json` (cấu hình), `extension/` (mã dựng màn), `draft-plan.json` (danh sách màn sẽ dựng). Thư mục này được commit để cả team (dev, BA, designer) cùng sửa và xem.

**1. Clone và chuyển sang repo của team** (một người làm một lần):
```sh
git clone https://github.com/xuanntdev/figma-design-toolkit.git my-app-design
cd my-app-design
git remote rename origin upstream                 # giữ kit gốc để lấy bản cập nhật
git remote add origin <url-repo-của-team>
python design_sync.py init --name "Tên dự án" --frame desktop
git add project && git commit -m "Init design project" && git push -u origin main
```

**2. Mọi người trong team:**
```sh
git clone <url-repo-của-team> && cd my-app-design
python design_sync.py build
```
*(Trên macOS/Linux, dùng `python3` nếu cần.)*

**3. Import vào Figma Desktop** (mỗi máy một lần): **Plugins → Development → Import plugin from manifest…** → `project/dist/manifest.json`. Mở plugin mang **tên dự án** → bấm **Cập nhật**.

Mỗi lần sửa `project/`: chạy lại `build`, mở lại plugin, bấm **Cập nhật**, rồi commit + push `project/` cho người khác pull về.

**Cập nhật kit:** `git pull upstream main`. Kit gốc không bao giờ chứa `project/`, nên không đụng vào màn của team.

> Dự án mới có sẵn **màn mẫu** `welcome` (`project/extension/01-screens.js` + `project/draft-plan.json`) để xem cách viết. Thay bằng màn thật trước khi bấm **Cập nhật**, nếu không plugin sẽ dựng cả màn mẫu.
>
> Chưa `init` thì `python design_sync.py build` dựng plugin mẫu từ `example/` ra `plugin/`.

## Cấu hình dự án (`project/design-sync.json`)

```json
{
  "name": "My App Design",
  "id": "my-app-design",
  "frame": "desktop",
  "target": "improved",
  "labels": { "currentName": "Hiện tại", "improvedName": "Cải tiến" }
}
```

| Khoá | Ý nghĩa |
| --- | --- |
| `name` / `id` | Tên plugin hiện trong Figma (cả tiêu đề cửa sổ) và ID trong manifest. `init --name` (bắt buộc) tự sinh `id`. |
| `frame` | Cỡ khung màn: `desktop` (1440×1024), `tablet` (834×1194), `mobile` (393×873), `"1280x800"` hoặc `{ "width", "height", "perRow" }`. Lưới và mã dựng màn (`ST_GRID.cellW/cellH`) theo cỡ này. |
| `target` | Bấm **Cập nhật** dựng vào đâu: `improved` = khung **Cải tiến** (bản đề xuất), `current` = khung **Hiện tại** (vẽ lại màn đang chạy). |
| `labels` | Đổi tên khung/trang: `currentName`, `improvedName`, `currentSub`, `improvedSub`, `pageFeatures`, `pageTokens`. |

Sửa file rồi chạy lại `build` là đủ. Cờ `build --name/--id/--extension/--plan/--out` vẫn dùng được và luôn thắng cấu hình.

## Bảng lệnh CLI

| Lệnh | Tác dụng |
| --- | --- |
| `python design_sync.py init --name <tên> [--frame] [--target]` | Tạo dự án của team tại `project/`. Mặc định `--frame desktop --target improved`. |
| `node docs/capture-web.mjs <url> <screenId>` | Chụp màn web Sáng/Tối làm tham chiếu, viewport lấy theo `frame` của dự án (cần `npm i playwright`). |
| `python design_sync.py build` | Dựng plugin offline cho `project/` ra `project/dist/`. |
| `python design_sync.py check` | Kiểm giới hạn mã sạch (≤ 300 dòng/file, ≤ 40 dòng/hàm) của `project/extension/` và cú pháp `project/dist/code.js`. |
| `python design_sync.py manifest --root <dir> --version <v> --commit <sha>` | Tạo `current/manifest.json` kèm SHA-256 cho thư mục ảnh chụp tham chiếu. |
| `python verify_release.py` | Chạy trọn bộ kiểm thử tự động (yêu cầu Node.js). |

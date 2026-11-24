# Cài đặt & cấu hình dự án

## Thiết lập cho team

Toolkit làm việc qua plugin Development được import bằng manifest trong Figma Desktop. CLI gửi lệnh tới plugin qua `localhost`. Toolkit không gọi Figma REST API, không dùng Figma MCP và không yêu cầu access token Figma.

Mỗi dự án **clone kit thành repo thiết kế của chính dự án** và dùng luôn repo đó. Repo đặt tên theo dự án (vd `my-app-design`). Tên dự án truyền qua `init --name` thành tên plugin, tiêu đề cửa sổ plugin trong Figma và tiêu đề `project/README.md`; `id` plugin sinh từ tên này. Màn của dự án nằm trong `project/`: `design-sync.json` (cấu hình), `extension/` (mã dựng màn), `draft-plan.json` (danh sách màn sẽ dựng). Thư mục này được commit để cả team (dev, BA, designer) cùng sửa và xem. Bản build `project/dist/` và khoá `project/.bridge-key` đã bị `.gitignore` của kit chặn nên không vào repo.

**1. Clone và chuyển sang repo của team** (một người làm một lần):
```sh
git clone https://github.com/xuanntdev/figma-design-toolkit.git my-app-design   # tên repo theo dự án
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
python design_sync.py doctor
```
*(Trên macOS/Linux, dùng `python3` nếu cần.)*

**3. Import vào Figma Desktop** (mỗi máy một lần) qua **Plugins → Development → Import plugin from manifest…** → `project/dist/manifest.json`. Mở plugin ở đúng file để tự kết nối khi cầu nối đang chạy.

Mỗi dự án dùng cùng plugin cho kết nối, thao tác trực tiếp, duyệt lô và chạy bộ dựng. Giữ nguyên ID và đường dẫn manifest khi đổi phạm vi. Chạy `python design_sync.py build --plan <kế-hoạch.json>` để nạp kế hoạch mới vào cùng bundle, rồi mở lại plugin đã import. Các thao tác trực tiếp theo selection dùng [CLI Figma](figma-live.md).

**Cập nhật kit:** `git pull upstream main`. Kit gốc không bao giờ chứa `project/`, nên không đụng vào màn của team.

`init` tạo dự án trống để ghép một file Figma. Thêm mã vào `project/extension/` khi cần dựng màn bằng builder. Trước khi `init`, `build` dựng riêng lõi vào `plugin/`.

## Cấu hình dự án (`project/design-sync.json`)

```json
{
  "name": "My App Design",
  "id": "my-app-design",
  "frame": "desktop",
  "target": "improved",
  "improved": true,
  "bridge": { "port": 8787 },
  "labels": { "currentName": "Hiện tại", "improvedName": "Cải tiến" }
}
```

Mọi khoá ngoài tên/cỡ khung đều **tuỳ chọn, mặc định giữ hành vi cơ bản của kit** (lưới/container, thay bản nháp, không nhãn chữ, không Xem trước, không tự dọn). Mỗi dự án bật đúng thứ cần: xem 2 cách làm điển hình ở [workflow.md](workflow.md).

**Cơ bản**

| Khoá | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `name` / `id` | | Tên plugin hiện trong Figma (cả tiêu đề cửa sổ) và ID trong manifest. `init --name` (bắt buộc) tự sinh `id`. |
| `frame` | `mobile` | Cỡ khung màn: `desktop` (1440×1024), `tablet` (834×1194), `mobile` (393×873), `"1280x800"` hoặc `{ "width", "height", "perRow" }`. Lưới và mã dựng màn (`ST_GRID.cellW/cellH`) theo cỡ này. |
| `target` | `improved` | Bấm **Cập nhật** dựng vào đâu: `improved` = khu **Cải tiến** (bản đề xuất, sinh màn mới), `current` = khu **Hiện tại** (vẽ lại màn đang chạy để designer sửa trực tiếp). |
| `improved` | `true` | `false` = dự án chỉ có khu **Hiện tại**: plugin không tạo, không đòi, không đọc/ghi khu Cải tiến. Bắt buộc `target: "current"`. |
| `bridge` | bật sẵn khi `init` (`{ "port": 8787 }`); không có khoá = tắt | Cầu nối localhost để CLI đọc và ghi qua popup đã kết nối. Port từ 1024 đến 65535. Đặt `"bridge": null` hoặc bỏ khoá để dùng plugin hoàn toàn offline. |
| `readOnly` | `false` | Bật chế độ kiểm kê chỉ đọc trong cùng template popup. Cần có `bridge`. Chế độ này chỉ nhận lệnh đọc trạng thái và hiện kết nối cục bộ. |
| `labels` | | Đổi tên khung/trang: `currentName`, `improvedName`, `currentSub`, `improvedSub`, `pageFeatures`, `pageTokens`. |

**Bố cục khu Hiện tại** (khi `target: "current"`; khu Cải tiến luôn là lưới/gương Section)

| Khoá | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `layout` | `"grid"` | `"grid"`: khung **Hiện tại** dạng lưới (container), hoặc Section Sáng/Tối → nhóm nếu file đã có sẵn Section Hiện tại; Cải tiến gương lại cấu trúc đó. `"sections"`: khu Hiện tại là **cây Section** do plugin dựng và tự xếp lại mỗi lượt (không còn container Hiện tại; Cải tiến vẫn là container cạnh cây). Đổi từ `grid` sang `sections` thì lượt đầu tự chuyển khung cũ vào cây. |
| `sectionLevels` | `["area","group","flow"]` | Chỉ với `layout: "sections"`. Các cấp Section, đúng thứ tự khu → nhóm → luồng, bỏ cấp nào cũng được: `["group","flow"]`, `["group"]`, `["area","flow"]`… Khung màn nằm ở cấp cuối. Cấp lấy từ plan: khu = `groupOrders[nhóm].area`, luồng = `screenFlows[màn]`. |
| `collapseSingleFlow` | `true` | Nhóm chỉ có một luồng thì khung nằm thẳng trong Section nhóm (cấp luồng gộp vào nhóm). Chỉ khi `sectionLevels` có `group`. |
| `sectionFills` | `{"area": null, "group": "#DCEAFB", "flow": "#EEF5FE"}` | Màu nền từng cấp (`#RRGGBB`); `null` = trong suốt. Khoá bỏ trống lấy mặc định. Section designer đã có sẵn cùng tên giữ màu của họ. |
| `screenLabels` | `false` | `false`: kit không đặt tên layer hay nhãn. `"name"`: chỉ đặt tên layer `<mã> · <title>`. `true`: tên layer + 2 dòng chữ (tên màn, stem) phía trên mỗi khung (lưới chừa chỗ cho nhãn). |
| `sortGroups` | `false` | `true`: nhóm trong lưới xếp theo `order` (nhóm không có `order` xếp cuối). `false`: theo thứ tự extension khai báo. Cây Section luôn xếp theo `order`. |

**Đồng bộ khi bấm Cập nhật**

| Khoá | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `sync` | `"replace"` | `"replace"` thay bản nháp AI còn nguyên và giữ khung đã duyệt, vẽ tay hoặc chỉnh tay. `"merge"` thêm so sánh thay đổi giữa nguồn builder và khung đang có. Nguồn đổi khi khung cũng đã sửa thì báo xung đột trong plugin. |
| `preview` | `false` | `true`: **Cập nhật** hiện bảng **Xem trước** (bỏ qua / dựng mới / thay / giữ sửa tay / xung đột) rồi mới ghi khi bấm **Áp dụng**. `false`: ghi ngay. |
| `cleanup` | `false` | `true`: mỗi lượt tự dọn khu thừa (khu Cải tiến khi `improved: false`; ô/vùng chủ đề không có trong `DRAFT_PLAN.themes`, vd phần Tối khi plan chỉ `["light"]`). Chỉ xoá node do plugin tạo và chưa được bảo vệ; node designer tự vẽ giữ lại và được báo. |
| `tokens` | `"button"` | Trang **Token & Component** (extension có `buildTokens`): `"button"` = chỉ nút **Token**; `"update"` = làm mới thêm ở mỗi lượt Cập nhật; `"off"` = tắt (cũng tắt việc tự dựng trang này khi thiếu component, xem [workflow.md](workflow.md) mục 5). |

Hai cấu hình thường gặp:

```json
{ "target": "current", "improved": false, "layout": "sections", "sync": "merge", "preview": true, "cleanup": true }
{ "target": "improved", "improved": true, "layout": "grid", "sync": "replace" }
```

Sửa file rồi chạy lại `build` là đủ. Cờ `build --name/--id/--extension/--plan/--out` vẫn dùng được và luôn thắng cấu hình. Giá trị sai (vd `layout: "tree"`, `sectionLevels` sai thứ tự) bị từ chối ngay khi `build` kèm thông báo.

## Bảng lệnh CLI

| Lệnh | Tác dụng |
| --- | --- |
| `python design_sync.py init --name <tên> [--frame] [--target]` | Tạo dự án của team tại `project/`. Mặc định `--frame desktop --target improved`. |
| `node docs/capture-web.mjs <url> <screenId>` | Chụp màn web Sáng/Tối làm tham chiếu, viewport lấy theo `frame` của dự án (cần `npm i playwright`). |
| `python design_sync.py build` | Dựng plugin offline cho `project/` ra `project/dist/`. |
| `python design_sync.py check` | Kiểm giới hạn mã sạch (≤ 300 dòng/file, ≤ 40 dòng/hàm) của `project/extension/` và cú pháp `project/dist/code.js`. |
| `python design_sync.py serve [--port] [--state-dir] [--idle-exit phút]` | Chạy cầu nối (chỉ `127.0.0.1`), nhận trạng thái Figma từ plugin vào `project/figma-state/`. Cổng mặc định lấy từ `bridge.port`. |
| `python design_sync.py pull [--timeout 60]` | Xin plugin (đang mở trong Figma Desktop) đọc file Figma và chờ trạng thái về `project/figma-state/`; tự bật cầu nối nền nếu chưa chạy. Thoát khác 0 khi plugin không trả lời hoặc dự án đã tắt bridge. |
| `python design_sync.py export-png [nodeId] --out <ảnh.png>` | Xuất ảnh một frame qua cùng plugin. Bỏ ID để dùng selection đơn đang có. |
| `python design_sync.py import-state <tệp>` | Nạp snapshot JSON có sẵn vào `project/figma-state/`. |
| `python design_sync.py figma-diff [--json] [--base <thư mục>] [--no-git]` | So `project/figma-state/` với bản chốt trước (git HEAD) và nguồn repo; in báo cáo từng màn. Xem [workflow.md](workflow.md) mục 6. |
| `python design_sync.py manifest --root <dir> --version <v> --commit <sha>` | Tạo `current/manifest.json` kèm SHA-256 cho thư mục ảnh chụp tham chiếu. |
| `node capture/capture.mjs <nhóm>` / `node capture/gen-plan.mjs` | Tuỳ chọn: chụp web thành snapshot rồi sinh plan, xem [capture.md](capture.md). |
| `node capture/find-repeats.mjs [--dir] [--min-screens N]` | Tìm khối lặp giữa các màn của snapshot để chọn khối cần thành component, xem [workflow.md](workflow.md) mục 5. |
| `node tests/verify_link.js` / `node tests/verify_link_sample.js` | Kiểm engine link (luật giả; ví dụ `capture/link-example` trên trang mẫu). `verify_release.py` đã gọi sẵn. |
| `node tests/verify_project.js [code.js]` | Chạy plugin của dự án trong Figma giả: dựng hết màn trong plan, thiếu font, chạy lại ổn định (theo `sync`), hook Token (theo `tokens`). |
| `node tests/verify_state.js <code.js>` / `python tests/verify_bridge.py [state-out]` | Kiểm `readState` (thuần đọc, trạng thái màn, token, component) và cầu nối + `import-state` + `figma-diff`. `verify_release.py` đã gọi sẵn. |
| `python verify_release.py` | Chạy trọn bộ kiểm thử tự động (yêu cầu Node.js). |

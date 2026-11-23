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
| `bridge` | bật sẵn khi `init` (`{ "port": 8787 }`); không có khoá = tắt | Cầu nối localhost cho chiều Figma → repo ([workflow.md](workflow.md) mục 6): manifest cho plugin gọi đúng `http://localhost:<port>` (không địa chỉ nào khác), UI có nút **Gửi về repo** và hỏi `/pending`. Muốn plugin hoàn toàn offline thì đặt `"bridge": null` hoặc xoá khoá: `networkAccess` là `["none"]` và UI không có mã mạng. Port 1024–65535. Nút **Xuất trạng thái** + `import-state` luôn dùng được, không cần cầu nối. |
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
| `sync` | `"replace"` | `"replace"`: thay bản nháp `source=ai` của màn bằng bản dựng mới, chỉ giữ bản đã chọn (`status=chosen`) hoặc vẽ tay (`source=human`). `"merge"`: merge 3 chiều theo màn: không đổi nguồn thì bỏ qua, khung designer đã sửa tay (so vân tay) luôn giữ, nguồn đổi mà khung cũng đã sửa thì **xung đột** giải ngay trong plugin; có nút **Xuất thay đổi**. Trong chế độ Section kiểu `grid` (Hiện tại do designer vẽ sẵn) chỉ giữ bản sửa tay, chưa có xung đột. |
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
| `python design_sync.py import-state <tệp>` | Nạp tệp JSON từ nút **Xuất trạng thái** của plugin vào `project/figma-state/` (không cần mạng). |
| `python design_sync.py figma-diff [--json] [--base <thư mục>] [--no-git]` | So `project/figma-state/` với bản chốt trước (git HEAD) và nguồn repo; in báo cáo từng màn. Xem [workflow.md](workflow.md) mục 6. |
| `python design_sync.py manifest --root <dir> --version <v> --commit <sha>` | Tạo `current/manifest.json` kèm SHA-256 cho thư mục ảnh chụp tham chiếu. |
| `node capture/capture.mjs <nhóm>` / `node capture/gen-plan.mjs` | Tuỳ chọn: chụp web thành snapshot rồi sinh plan, xem [capture.md](capture.md). |
| `node capture/find-repeats.mjs [--dir] [--min-screens N]` | Tìm khối lặp giữa các màn của snapshot để chọn khối cần thành component, xem [workflow.md](workflow.md) mục 5. |
| `node verify_link.js` / `node verify_link_sample.js` | Kiểm engine link (luật giả; ví dụ `capture/link-example` trên trang mẫu). `verify_release.py` đã gọi sẵn. |
| `node verify_project.js [code.js]` | Chạy plugin của dự án trong Figma giả: dựng hết màn trong plan, thiếu font, chạy lại ổn định (theo `sync`), hook Token (theo `tokens`). |
| `node verify_state.js <code.js>` / `python verify_bridge.py [state-out]` | Kiểm `readState` (thuần đọc, trạng thái màn, token, component) và cầu nối + `import-state` + `figma-diff`. `verify_release.py` đã gọi sẵn. |
| `python verify_release.py` | Chạy trọn bộ kiểm thử tự động (yêu cầu Node.js). |

# Quy ước làm việc Hiện tại / Cải tiến

Kit không áp đặt một cách làm. Mỗi dự án chọn cách dùng trong `design-sync.json` (bảng đầy đủ ở [setup.md](setup.md)); mọi tính năng nâng cao đều tuỳ chọn.

## 1. Chọn cách làm

| | A. Sửa trực tiếp | B. Sinh màn mới / bản đề xuất |
| --- | --- | --- |
| Dùng khi | Vẽ lại màn đang chạy lên Figma rồi **designer sửa ngay trên đó** | Màn đang chạy chỉ để **tham chiếu**; kit sinh thêm màn mới/phương án vào khu **Cải tiến** |
| Khu ghi | **Hiện tại** (`target: "current"`) | **Cải tiến** (`target: "improved"`, `improved: true`) |
| Bố cục | `layout: "sections"`: cây Section, chọn cấp bằng `sectionLevels` (vd `["group","flow"]`) | `layout: "grid"`: lưới/container, hoặc gương Section của Hiện tại |
| Đồng bộ | `sync: "merge"`: không đổi thì bỏ qua, giữ bản designer sửa, xung đột giải trong plugin | `sync: "replace"`: thay bản nháp còn nguyên, giữ bản đã chọn/vẽ tay/sửa tay |
| Hay đi kèm | `preview: true`, `cleanup: true`, `improved: false`, `screenLabels: "name"` | mặc định là đủ; thêm `screenLabels` nếu cần nhãn trên canvas |

```json
{ "target": "current", "improved": false, "layout": "sections", "sectionLevels": ["group", "flow"], "sync": "merge", "preview": true }
{ "target": "improved", "improved": true, "layout": "grid", "sync": "replace" }
```

**Dùng cả hai:** giữ `improved: true`, đặt `layout`/`sync` hợp với khu Hiện tại và đổi `target` giữa các lần dựng. Với `layout: "sections"` Hiện tại là cây Section còn Cải tiến là container đặt bên phải cây; mỗi lượt chỉ ghi khu của `target`, khu kia giữ nguyên.

## 2. Hai chế độ trang trên Figma

- **File có sẵn Section (dự án đang chạy, `layout: "grid"`):** Trang màn hình có hai Section cùng cấp **Hiện tại** và **Cải tiến**, bên trong chia theo **Sáng / Tối → Nhóm tính năng → Frame màn hình**. Plugin đọc **Hiện tại** (chỉ đọc) để gương đúng tên nhóm, vị trí ô, màu nền, viền và bo góc sang **Cải tiến**; với `target: "current"` thì dựng thẳng vào Hiện tại.
- **File nháp mới:** Plugin tự tạo trang **Tính năng** gồm hai khung **Hiện tại** và **Cải tiến** đặt song song, thẳng hàng ngang theo từng màn hình (`layout: "sections"` thì Hiện tại là cây Section, không có khung Hiện tại).

Màn dựng vào khung nào do `target` quyết định:
- `improved` (mặc định): vào **Cải tiến**. **Hiện tại** chỉ đọc (gương cấu trúc, nhận ảnh chụp).
- `current`: vẽ lại màn đang chạy thẳng vào **Hiện tại**; khung mới không đè khung vẽ tay hay ảnh chụp. **Cải tiến** không bị đụng.

## 3. Bảo vệ bản đã duyệt và phần chỉnh tay

Mỗi Frame do plugin tạo được gắn metadata: `screenId` (trùng `stem` trong `DESIGN_EXTENSION`), `theme` (`light`/`dark`), `source` (`ai` = nháp tự dựng, `human` = designer tạo/chỉnh), `status` (`draft`/`chosen`).

Khi bấm **Cập nhật**:
1. Plugin kiểm tra đủ đích đến **trước khi ghi** bất kỳ node nào; sai trang hoặc thiếu nhóm thì dừng và báo lỗi.
2. Chỉ thay bản nháp `source=ai` còn nguyên của đúng `screenId + theme` trong `draft-plan.json`. Giữ bản đã duyệt, vẽ tay hoặc đã chỉnh, đặt bản mới cạnh để so sánh. Khi thay frame, kit nối lại các liên kết prototype trực tiếp từ layer còn tồn tại và báo lớp cần xử lý nếu việc nối lại bị chặn.
3. Màn ngoài danh sách và khu không phải `target` không bị đụng tới.

**Chủ đề lấy từ `DRAFT_PLAN.themes`** (vd chỉ `["light"]`): bố cục, nhãn, ô giữ chỗ chỉ dựng cho các chủ đề đó. Không có plan thì kit giữ mặc định light + dark.

### Đồng bộ `sync: "merge"` (tuỳ chọn)

Mỗi lượt Cập nhật = pull Figma → merge 3 chiều theo màn → push. Lúc dựng plugin lưu trên khung: `fp` (vân tay nội dung: kích thước + cây con loại/tên/vị trí/chữ/màu nền đầu), `srcHash` (hash nội dung nguồn/snapshot), `buildHash` (hash mã bộ dựng). Khung `source=ai` mà vân tay khác `fp` là **đã sửa tay**: gắn `source=human` + `edited=1` và giữ nguyên. Khung bản cũ chưa có vân tay chỉ được thay khi đúng tên, kích thước và node con cấp 1; không chắc thì giữ và báo. Muốn dựng đè một khung đã sửa: xoá khung đó trên Figma.

| Figma (theirs) | Nguồn (ours) | Kết quả |
|---|---|---|
| không sửa | không đổi | bỏ qua, không dựng lại |
| không sửa | đổi | thay bằng bản mới |
| sửa tay | không đổi | giữ bản sửa tay, không dựng nháp mới |
| sửa tay | đổi | XUNG ĐỘT: giữ bản sửa tay, bản mới nằm cạnh, cả hai viền + nhãn đỏ "Xung đột" (tag `conflict=1`) |

Đổi mã bộ dựng mà nguồn không đổi: khung chưa sửa dựng lại, khung đã sửa giữ nguyên và không báo xung đột. Mục **Xung đột** trong plugin: bấm tên màn để zoom tới cặp khung; **Giữ bản sửa tay** (xoá bản mới, lần sau không báo lại) hoặc **Lấy bản mới** (xoá bản sửa tay, bấm 2 lần để xác nhận); không có gì tự xoá khi chưa chọn. **Xuất thay đổi** tải JSON các màn sửa tay/xung đột (screenId, mã màn, title, groupId, fp, srcHash, chữ thêm/bớt so với snapshot), lưu vào `project/figma-edits/` trong repo. Chưa merge mức phần tử.

`sync: "replace"` (mặc định) không so vân tay: bản nháp `ai` luôn được thay, kể cả khi designer đã sửa mà chưa đổi tag; muốn giữ thì đánh dấu `status=chosen` hoặc `source=human`.

### Xem trước `preview: true` (tuỳ chọn)

**Cập nhật** hiện bảng (bỏ qua / dựng mới / thay / giữ sửa tay / xung đột, kèm danh sách mã màn), chưa ghi gì; **Áp dụng** mới ghi, trong 1 bước undo. Với `sync: "replace"` bảng chỉ có "dựng mới" và "thay". `preview: false` thì Cập nhật ghi ngay.

### Cây Section `layout: "sections"` (tuỳ chọn)

Khu Hiện tại (`target: "current"`) là cây Section lồng nhau theo `sectionLevels`, mặc định khu → nhóm → luồng → frame màn; bỏ cấp nào cũng được (`["group","flow"]`, `["group"]`…), khung nằm ở cấp cuối. Nhóm chỉ một luồng thì cấp luồng gộp vào nhóm (`collapseSingleFlow`). Màu từng cấp: `sectionFills` (`null` = trong suốt). Mỗi lượt Cập nhật: gom mọi khung plugin tạo (cây + bố cục cũ) → chuyển vào đúng Section lá theo `DRAFT_PLAN.groupOrders` (order/title/area) + `screenFlows` → ghi từng màn trong lô theo `sync` → dọn vỏ cũ đã trống (node designer cản thì giữ + báo) → xếp lại cả cây (theo order, lưới `perRow` trong luồng, Section ôm nội dung, không đè). Gốc cây là Section "Hiện tại" nếu có, không thì trang "Tính năng". Cả lượt là đúng 1 bước hoàn tác.

```json
{ "groupOrders": { "orders": { "order": 10, "title": "1 · Đơn hàng", "area": "KHU A" } },
  "screenFlows": { "orders-list": { "id": "list", "title": "DANH SÁCH", "order": 1 } } }
```

Plan không có `area` thì khu là `KHÁC`; màn không có trong `screenFlows` giữ luồng hiện tại của khung (Section luồng cha), chỉ khi thật không biết mới vào luồng `KHÁC`. `capture/gen-plan.mjs --groups` vẫn ghi `screenFlows`/`groupOrders` của mọi nhóm đã chụp để build theo lô không làm nhóm ngoài lô rơi vào `KHÁC`. Section designer đã có cùng tên giữ màu của họ.

### Dọn `cleanup: true` (tuỳ chọn)

Mỗi lượt Cập nhật dọn khu thừa: khu **Cải tiến** còn sót khi `improved: false`, và vùng/hàng/ô/nhãn của chủ đề không có trong `DRAFT_PLAN.themes`. Chỉ xoá node do plugin tạo và chưa được bảo vệ; frame `source=human`, `status=chosen` và node không tag plugin (designer tự vẽ) luôn giữ, khu chứa chúng cũng giữ và được báo trong kết quả. Dọn nằm chung bước hoàn tác của lượt Cập nhật. `cleanup: false` thì kit không xoá gì ngoài bản nháp của chính màn đang dựng.

### Nhãn màn `screenLabels` (tuỳ chọn)

`"name"`: tên layer `<mã> · <title>`. `true`: thêm 2 text node phía trên frame (tên màn, stem). Mã = `<order nhóm>.<số thứ tự màn, 2 chữ số>`. `false` (mặc định): kit không đặt tên/nhãn.

### Trang Token & Component `tokens` (tuỳ chọn)

Extension khai `DESIGN_EXTENSION.buildTokens(page)` thì UI có nút **Token** làm mới trang đó (`tokens: "button"`, mặc định); `"update"` làm mới thêm ở mỗi lượt Cập nhật (commit undo riêng, lỗi token không làm hỏng lượt dựng màn); `"off"` tắt. Không khai `buildTokens` thì không có gì. Hàm cần idempotent (chạy lại không nhân đôi variable/style/component).

### Dữ liệu snapshot theo nhóm (`snapshot-dir`)

Ngoài `png-map`, tệp `data/<nhóm>.gen.json` có thể khai `{ "kind": "snapshot-dir", "dir": "<thư mục chứa group.json + <stem>.json>", "registry": "SNAPS", "index": "GROUPS", "exclude": ["stem"] }`: build nhúng mọi snapshot của nhóm vào `registry[stem]` và đẩy meta nhóm vào `index` (khai báo trước ở một mô-đun `.js`, vd `00-registry.js`); `exclude` bỏ stem khỏi bundle. Dự án lớn chỉ nhúng các nhóm cần dựng rồi build lại theo lô, nhóm khác trên Figma không bị đụng.

## 4. Hoàn tác an toàn

- Nút **Hoàn tác** mặc định bị khoá khi mở plugin để không hoàn tác nhầm thao tác chỉnh tay trước đó trên Figma.
- Nút chỉ mở sau khi bấm **Cập nhật** tạo khung mới thành công, gỡ đúng lượt vừa chạy (kể cả bước dọn/chuyển khung nếu có) và tự khoá lại ngay sau khi hoàn tác.

## 5. Dựng màn bằng component liên kết (engine link)

Theo [nguyen-tac.md](nguyen-tac.md) mục 1, màn dựng ra là **instance của component trên trang Token & Component + biến token**, không vẽ lại khối rời cho từng màn. Engine nằm ở lõi (`kit_core/plugin/core/07k..07o`), **không có cờ bật/tắt** và không phụ thuộc `target` / `layout` / `sync` / `preview` / `tokens`. Phần riêng của dự án chỉ là luật khớp, khai ở extension:

| Khai báo trên `DESIGN_EXTENSION` | Ý nghĩa |
| --- | --- |
| `linkRules` | Mảng luật `{ name, match(node, ctx), matchRun?(list, i, ctx) }`, thử theo thứ tự, luật đầu khớp thắng. |
| `linkTokens()` | Bảng tra token: `{ fill, stroke, text: { "#hex": "tên biến" }, radius: { 12: "tên biến" }, textStyles: [{ name, family, style, size, lineHeight }] }`. |
| `linkTag` | Tên plugin data nhận ra component trong thư viện (mặc định `linkComp`); mỗi COMPONENT mang `<linkTag> = <khoá>`. |
| `buildTokens(page)` | Dựng trang Token & Component (đã có từ mục "Trang Token & Component"); engine tự gọi khi file thiếu component. |

**Cách hoạt động.** Mọi danh sách con (con của frame, gốc màn) dựng qua `lkBuildChildren(parent, list, ctx, raw)` — bộ dựng của extension gọi hàm này thay vì tự lặp. Với mỗi node: có luật khớp thì tạo instance (`createInstance`), chọn variant, đặt text/boolean property, đổi icon (INSTANCE_SWAP), ghi đè instance lồng; **không luật nào khớp chắc chắn** thì gọi `raw(parent, node, ctx)` (khối thô) rồi gắn token cho khối đó và thống kê là "chưa liên kết". Extension không khai `linkRules` / `linkTokens` thì engine chỉ gọi `raw`: màn dựng y như trước. `ctx` do extension đưa vào: `count(node)` (số node trong cây con, để tính độ phủ) và `label(node)` (nhãn thống kê).

- **Luật một node**: `match(node, ctx)` trả `null` hoặc `{ comp, variant?, props?, swaps?, nested?, radius?, name?, size? }`: `comp` = khoá component; `variant` = `{ Type: "primary" }`; `props` = text/boolean property theo tên gốc; `swaps` = `{ Icon: { comp, variant } }`; `nested` = ghi đè instance lồng theo tên node (`props`, `swaps`, `visible`, `text`, `recolor`); `size: false` giữ cỡ của component thay vì cỡ node nguồn. Chỉ trả kết quả khi khớp **chắc chắn** (tên, màu, số con); không thì trả `null`.
- **Luật một đoạn anh em** (`matchRun`): nhận cả danh sách con và vị trí `i`, trả `{ link, span, box: { x, y, w, h } }` để một instance thay `span` node liên tiếp (vd thanh phân trang = chữ + mũi tên + số trang + ô chọn). Luật có thể chỉ khai `matchRun`.
- **Gắn token** cho khối thô: fill / viền / màu chữ khớp hex → biến Color; bo góc khớp số → biến Radius; chữ khớp (family, style, cỡ, line-height px) → text style (áp ở cuối lượt, nên dựng chữ phải đặt `lineHeight` px đúng CSS). Không khớp thì giữ giá trị thô và ghi vào `tokenMiss`.
- **Self-heal**: đầu mỗi lượt Cập nhật engine đọc lại component và biến từ trang Token; file chưa có thì tự dựng trang Token trước (cần `buildTokens`, và `tokens` khác `"off"`) rồi mới dựng màn; bước đó là một bước hoàn tác riêng nên **Hoàn tác** chỉ gỡ khung màn. **Xem trước** chỉ đọc, không dựng gì.
- **Vân tay / merge**: vân tay của instance = tên + vị trí + giá trị các property đã khai lúc dựng (plugin data `lk`), không băm ruột; dùng được cho cả `sync: "replace"` lẫn `"merge"`. Sửa component gốc (đổi ruột, thêm property, đổi biến) không làm khung bị coi là sửa tay; designer đổi property / variant / swap của instance thì bị coi là sửa tay (`merge` giữ nguyên và báo xung đột khi nguồn đổi).
- **Thống kê**: kết quả **Cập nhật** có `link`: `linkedPct` (% node thành instance), `byComp` / `byRule`, `missing` (luật khớp nhưng thiếu component), `errors` (luật ném lỗi, lượt vẫn chạy), `tokens.<fill|stroke|text|radius|textStyle>` (`bound/total/pct`), `tokenMiss` (giá trị chưa có token) và `unmatchedTop` (phần tử chưa có luật, nhiều nhất trước) để biết bổ sung luật nào.
- **Tìm khối lặp trước khi viết luật**: `node capture/find-repeats.mjs [--dir project/snapshots] [--min-screens 5] [--json out.json]` băm cấu trúc cây con của snapshot (bỏ chữ dữ liệu, vị trí, kích thước) và in khối lặp giữa nhiều màn, khối lớn nhất trước; khối nào lặp ≥ 5 màn thì nên là component.
- **Ví dụ chạy được**: [`capture/link-example/`](../capture/link-example) (Button, Tag, App/Header + luật theo tên `thẻ.class`, token mẫu) trên `capture/sample-site`; cách dùng ở [capture.md](capture.md). `tests/link-extension/` là bản luật giả thuần dữ liệu dùng để kiểm lõi.


## 6. Chiều ngược: Figma → repo (AI đọc được Figma đang có gì)

Plugin đọc file Figma đã ghép rồi đưa kết quả vào `project/figma-state/`. Đây là bản đọc để AI hiểu canvas và design system. `pull` chỉ đọc và không tạo bước Undo. Dựng hoặc chỉnh trong file qua [luồng trực tiếp](figma-live.md).

**Bố cục `project/figma-state/`** (mỗi lần kéo thay nguyên khối bằng bản mới):

| Tệp | Nội dung |
|---|---|
| `index.json` | Trang, cây Section (tên, cấp, số màn), mọi khung màn: `screenId`, tên khung, đường dẫn Section, vị trí/kích thước, `status`, `fp`/`srcHash`/`buildHash`, `readAt` (thời điểm đọc, dùng kiểm độ mới) |
| `screens/<mã màn>.json` | Cây node gọn, mỗi node một dòng: loại, tên, vị trí, bố cục, fill/stroke kèm tên biến, bo góc, chữ + text style + font; INSTANCE chỉ ghi component, variant, property, chữ hiển thị, instance lồng nhau |
| `tokens.json` | Collection, biến (giá trị đã resolve, alias, scopes, code syntax), text style; thêm mục `repo` (bảng token extension khai ở `linkTokens()`) khi extension có khai, để so |
| `components.json` | Component/component set trên các page, có ID, biến thể, định nghĩa property và mô tả |

`status` của khung màn: `untouched` = giống bản plugin dựng (vân tay `fp` khớp), `edited` = designer đã sửa, `handmade` = khung không do plugin tạo, `unknown` = khung bản cũ chưa có vân tay. Khung đã sửa mà chữ khác nguồn repo thì index có `textDiff` (thêm/bớt so với nguồn), và `repoChanged` báo nguồn repo đã đổi từ lần dựng.

Chạy `doctor`, mở plugin trong Figma Desktop và bấm **Kết nối file**, rồi chạy `python design_sync.py pull`. File lớn có thể dùng `--timeout 180`. Cầu nối tự thoát sau 30 phút không có hoạt động.

Cấu hình `"bridge": {"port": 8787}` trong `design-sync.json` được tạo sẵn bởi `init`. Cầu nối đọc qua `127.0.0.1` và ghi snapshot vào `project/figma-state/`. Đặt thêm `"readOnly": true` để chỉ hiện trạng thái kiểm kê trong cùng template popup. `python design_sync.py import-state <tệp>` nạp một snapshot JSON có sẵn mà không cần mở Figma.

**Xem khác biệt:** `python design_sync.py figma-diff [--json]` so `figma-state/` với bản đã commit ở git HEAD (mốc chốt trước) và với nguồn repo: màn sửa tay + đổi gì (chữ, component/variant/property, màu/token, node thêm/bớt), khung vẽ tay không có trong repo, màn plan chưa có trên Figma, token/text style lệch bảng token của extension, component set đổi. Quy trình cho AI (kéo, đọc, hỏi user xử lý từng nhóm thay đổi) ở [ai-prompts.md](ai-prompts.md) mục 4.

**Có commit `figma-state/` không?** Nên commit: team và AI thấy cùng một trạng thái Figma, commit chính là cách "chốt làm mốc" cho lần `figma-diff` sau, và lịch sử git cho thấy designer đổi gì theo thời gian. Muốn không theo dõi thì thêm `/figma-state/` vào `project/.gitignore` (khi đó `figma-diff` chỉ so với nguồn repo, hoặc truyền `--base <thư mục>`).

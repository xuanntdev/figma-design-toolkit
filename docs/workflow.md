# Quy ước làm việc Hiện tại / Cải tiến

Kit không áp đặt một cách làm. Mỗi dự án chọn cách dùng trong `design-sync.json` (bảng đầy đủ ở [setup.md](setup.md)); mọi tính năng nâng cao đều tuỳ chọn.

## 1. Chọn cách làm

| | A. Sửa trực tiếp | B. Sinh màn mới / bản đề xuất |
| --- | --- | --- |
| Dùng khi | Vẽ lại màn đang chạy lên Figma rồi **designer sửa ngay trên đó** | Màn đang chạy chỉ để **tham chiếu**; kit sinh thêm màn mới/phương án vào khu **Cải tiến** |
| Khu ghi | **Hiện tại** (`target: "current"`) | **Cải tiến** (`target: "improved"`, `improved: true`) |
| Bố cục | `layout: "sections"`: cây Section, chọn cấp bằng `sectionLevels` (vd `["group","flow"]`) | `layout: "grid"`: lưới/container, hoặc gương Section của Hiện tại |
| Đồng bộ | `sync: "merge"`: không đổi thì bỏ qua, giữ bản designer sửa, xung đột giải trong plugin | `sync: "replace"`: thay bản nháp, chỉ giữ bản đã chọn/vẽ tay |
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
2. Chỉ thay bản nháp `source=ai` chưa duyệt của đúng `screenId + theme` trong `draft-plan.json`; bản `status=chosen` hoặc `source=human` giữ nguyên, bản mới đặt cạnh để so sánh.
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

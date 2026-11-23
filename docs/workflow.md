# Quy ước làm việc Hiện tại / Cải tiến

## 1. Hai chế độ trang trên Figma

- **File có sẵn Section (khuyên dùng cho dự án đang chạy):** Trang màn hình có hai Section cùng cấp **Hiện tại** và **Cải tiến**, bên trong chia theo **Sáng / Tối → Nhóm tính năng → Frame màn hình**. Plugin đọc **Hiện tại** (chỉ đọc) để gương đúng tên nhóm, vị trí ô, màu nền, viền và bo góc sang **Cải tiến**.
- **File nháp mới:** Plugin tự tạo trang **Tính năng** gồm hai khung **Hiện tại** và **Cải tiến** đặt song song, thẳng hàng ngang theo từng màn hình.

Dự án chỉ cần khu Hiện tại: đặt `"improved": false` (cùng `"target": "current"`) trong `design-sync.json`. Khi đó plugin không tạo/đòi/đọc/ghi **Cải tiến**, và **mỗi lượt Cập nhật tự dọn** khu Cải tiến còn sót (container/Section, nhận theo tag kit hoặc tên `Cải tiến`).

**Chủ đề lấy từ `DRAFT_PLAN.themes`** (dự án chỉ `["light"]`): bố cục, nhãn, ô giữ chỗ chỉ dựng cho các chủ đề đó, không có hàng/vùng/hậu tố `· Tối`; không có plan thì kit giữ mặc định light + dark. Lượt Cập nhật cũng xoá vùng Section `Tối`, ô/nhãn/ô giữ chỗ `dark` do bản cũ tạo.

**Dọn an toàn** (cùng lượt Cập nhật, nằm chung một bước hoàn tác của Figma): chỉ xoá node do plugin tạo (có tag) và chưa được bảo vệ. Frame `source=human`, `status=chosen` và node không có tag plugin (designer tự vẽ) luôn giữ, khu chứa chúng cũng giữ; kết quả Cập nhật báo "Giữ lại khu X vì có N khung do designer tạo". Dọn xong container tính lại lưới (co lại, không để khoảng trống); Section do user đặt không bị dời. Nút Hoàn tác của kit dùng `figma.triggerUndo()` nên gỡ cả bước dọn; bản không có `triggerUndo` chỉ gỡ khung vừa dựng (Ctrl+Z của Figma vẫn hoàn tác được phần dọn).

**Khung đã sửa tay không bao giờ bị ghi đè**: lúc dựng plugin lưu dấu vân tay nội dung (`fp`: kích thước + cây con gồm loại/tên/vị trí/chữ/màu nền đầu) vào plugin data của khung. Lượt sau, khung `source=ai` mà vân tay khác (designer sửa mà không đổi tag) được gắn `source=human` + `edited=1`, giữ nguyên, bản nháp mới nằm cạnh (container) hoặc bên dưới (Section), kết quả báo "Giữ N màn đã sửa tay". Khung bản cũ chưa có vân tay chỉ được thay khi đúng tên, đúng kích thước và node con cấp 1 trùng bản plugin sẽ dựng; không chắc thì giữ và báo. Vân tay không tính vị trí/tên của chính khung và kích thước text. Muốn plugin dựng đè một khung đã sửa: xoá khung đó trên Figma. Dọn Cải tiến/Tối dùng cùng tiêu chí.

**Đồng bộ kiểu git theo màn** (mỗi lượt Cập nhật = pull Figma → merge 3 chiều → push): base = bản plugin dựng lần trước, lưu ngay trên khung (`fp` vân tay, `srcHash` hash nội dung nguồn/snapshot, `buildHash` hash mã bộ dựng); theirs = khung hiện tại (vân tay khác `fp` = đã sửa tay); ours = nguồn mới (`srcHash` mới).

| Figma (theirs) | Nguồn (ours) | Kết quả |
|---|---|---|
| không sửa | không đổi | bỏ qua, không dựng lại |
| không sửa | đổi | thay bằng bản mới |
| sửa tay | không đổi | giữ bản sửa tay, không dựng nháp mới |
| sửa tay | đổi | XUNG ĐỘT: giữ bản sửa tay, bản mới nằm cạnh, cả hai viền + nhãn đỏ "Xung đột" (tag `conflict=1`) |

Đổi mã bộ dựng mà nguồn không đổi: khung chưa sửa dựng lại, khung đã sửa giữ nguyên và không báo xung đột. Khung bản cũ chưa có `srcHash`: giữ logic an toàn (nguyên bản thì thay, đã sửa/vẽ tay thì giữ + bản mới cạnh). UI: **Cập nhật** = **Xem trước** (bảng bỏ qua / dựng mới / thay mới / giữ sửa tay / xung đột + danh sách mã màn, chưa ghi gì) → **Áp dụng** ghi trong 1 bước undo (Hoàn tác vẫn chạy). Mục **Xung đột**: bấm tên màn để zoom tới cặp khung; **Giữ bản sửa tay** (xoá bản mới, base = nguồn mới nên lần sau không báo lại) hoặc **Lấy bản mới** (xoá bản sửa tay, bấm 2 lần để xác nhận); không có gì tự xoá khi chưa chọn. **Xuất thay đổi** tải JSON các màn sửa tay/xung đột (screenId, mã màn, title, groupId, fp, srcHash, chữ thêm/bớt so với snapshot) — lưu vào `project/figma-edits/` trong repo. Chưa merge mức phần tử.

**Khu Hiện tại (target=current) = cây Section lồng nhau** khu (`area`) → nhóm → luồng → frame màn, thay cho container và vùng Sáng/Tối cũ. Mỗi lượt Cập nhật: gom mọi khung plugin tạo (cây mới + bố cục cũ) → chuyển vào đúng Section luồng theo `DRAFT_PLAN.groupOrders` (order/title/area) + `screenFlows` → merge từng màn trong lô → dọn vỏ cũ đã trống (node designer cản thì giữ + báo) → xếp lại cả cây (khu theo order nhỏ nhất, nhóm theo order, luồng theo order luồng, lưới `perRow` trong luồng, Section ôm nội dung, không đè). Gốc cây là Section "Hiện tại" nếu có, không thì trang "Tính năng" (Section không nằm được trong khung). Cả lượt là đúng 1 bước hoàn tác.

```json
{ "groupOrders": { "orders": { "order": 10, "title": "1 · Đơn hàng", "area": "KHU A" } },
  "screenFlows": { "orders-list": { "id": "list", "title": "DANH SÁCH", "order": 1 } } }
```

Plan không có `area`/`screenFlows` thì khu và luồng đều là `KHÁC`. Màu từng cấp nằm ở `TREE.fills` (`kit_core/plugin/core/07g-tree-meta.js`); Section designer đã có cùng tên giữ nguyên màu của họ. Khu **Cải tiến** vẫn dùng bố cục Section mirror / container.

**Dữ liệu snapshot theo nhóm (`snapshot-dir`) và build theo nhóm.** Ngoài `png-map`, tệp `data/<nhóm>.gen.json` có thể khai `{ "kind": "snapshot-dir", "dir": "<thư mục chứa group.json + <stem>.json>", "registry": "SNAPS", "index": "GROUPS", "exclude": ["stem"] }`: build nhúng mọi snapshot của nhóm vào `registry[stem]` và đẩy meta nhóm vào `index` (cả hai khai báo trước ở một mô-đun `.js`, vd `00-registry.js`); `exclude` bỏ stem khỏi bundle. Dự án lớn chỉ nhúng các nhóm cần dựng rồi build lại theo lô, nhóm khác trên Figma không bị đụng.

**Nhãn màn.** Mỗi frame có tên layer `<mã> · <title>` và 2 text node phía trên (tên màn, stem). Mã = `<order nhóm>.<số thứ tự màn, 2 chữ số>`. Tắt bằng `"screenLabels": false` trong `design-sync.json`.

**Trang Token & Component (tuỳ chọn).** Extension khai `DESIGN_EXTENSION.buildTokens(page)` thì mỗi lượt Cập nhật làm mới trang đó trước khi dựng màn (commit undo riêng, lỗi token không làm hỏng lượt dựng), và UI có nút **Token & Component** chỉ làm mới trang này. Không khai thì hook không làm gì. Hàm cần idempotent (chạy lại không nhân đôi variable/style/component).

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

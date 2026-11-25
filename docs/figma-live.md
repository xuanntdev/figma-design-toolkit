# Thiết kế trực tiếp từ Figma

## Kết nối

Mọi thao tác đọc và sửa thiết kế trong hướng dẫn này đi qua plugin Development chạy trong Figma Desktop. CLI trao đổi với plugin qua `localhost`. Toolkit không gọi Figma REST API, không dùng Figma MCP và không yêu cầu access token Figma.

```sh
python design_sync.py init --name "Team Design"
python design_sync.py build
python design_sync.py doctor
```

Trong Figma Desktop, chọn **Plugins → Development → Import plugin from manifest…** và mở `project/dist/manifest.json`. Plugin tự kết nối khi mở trong file đích và cầu nối đang chạy. `doctor` khởi động cầu nối khi cần và báo phiên đang ghép. Giữ plugin mở trong lúc chat. Muốn chuyển file, dùng **Ngắt kết nối** ở cửa sổ trước rồi mở plugin trong file mới. Khóa cầu nối `localhost` được tạo khi build.

Cùng popup dùng cho thao tác theo selection, lô chờ **Cập nhật** và bộ dựng dự án nếu có. Khi đổi danh sách bộ dựng, dùng `build --plan <tệp>` với đường dẫn manifest đã import.

```sh
python design_sync.py pull
python design_sync.py selection
python design_sync.py find "số hợp đồng" --type TEXT
python design_sync.py tree "12:34" --session "<session>"
python design_sync.py lint --within "12:34"
python design_sync.py impact "12:34" --session "<session>"
```

`pull` đưa canvas Figma vào `project/figma-state`. Dùng `index.json` tìm page và màn, `screens/` đọc cây, `components.json` tìm ID component/variant và `tokens.json` tìm ID biến/style. `documentSession` cho biết phiên đã đọc. Khi mở file hoặc phiên khác, kéo lại trước khi dùng các ID này. Bản kéo giới hạn mỗi màn 800 layer và 16 cấp; đặt `pull --max-nodes N --depth D` khi cần sâu hơn.

`find`, `tree`, `selection` và `lint` đọc trực tiếp file đang mở, còn `figma-state` là bản chụp tại lần `pull` (`readAt`).

- `find [chuỗi] [--type T] [--component C] [--within ID] [--page-id ID] [--limit N]`: tìm theo tên layer hoặc nội dung chữ (không phân biệt dấu, hoa thường), loại node hoặc component; in danh sách gọn kèm ID, đường dẫn và tổng số kết quả.
- `tree <id>` và `selection`: in dàn ý mỗi node một dòng (rộng×cao fill|hug|px, flex row|col, gap, pad, căn trục, nền, viền, bo góc, bóng, chữ, style/biến, component + variant). Cây vượt `--lines` thì cấp sâu được thu gọn kèm ID để đọc tiếp; JSON của lần đọc được ghi ra tệp tạm (đường dẫn in ở đầu). `tree` mặc định sâu 8 cấp, 800 layer (`--depth`, `--max-nodes`).
- `lint [--within ID] [--page-id ID] [--rule R] [--limit N]`: rà màu thô chưa gắn biến/style (`raw-fill`, `raw-stroke`), chữ chưa có text style (`no-text-style`), instance đã detach (`detached`), khung chỉ bọc một con (`wrapper`); mặc định page đang mở, bỏ qua instance. Dùng kết quả để sửa hàng loạt bằng `stage`.
- Thêm `--json` để in JSON thô.

## Xuất ảnh từ canvas Figma

Chọn đúng frame trong Figma hoặc truyền ID từ `selection` hay `tree`. Lệnh xuất PNG chỉ đọc file đã ghép và in đường dẫn ảnh cùng tên, ID và kích thước của frame.

```powershell
python design_sync.py export-png --out "$env:TEMP\figma-review.png"
python design_sync.py export-png "12:34" --session "<session>" --scale 2 --out "$env:TEMP\figma-review-2x.png"
```

Dùng thư mục tạm cho ảnh rà soát. Nếu cần kích thước layer, nội dung, style và binding, đọc thêm bằng `tree`.

## Ghi

Cả `edit`, `create` và `stage` nhận tệp JSON và phiên từ `selection` hoặc `doctor`. Có thể truyền phiên trong JSON hoặc bằng `--session`.

```sh
python design_sync.py edit change.json --session "<session>"
python design_sync.py create screen.json --session "<session>"
python design_sync.py stage bulk.json --session "<session>"
python design_sync.py status
python design_sync.py protect block "1:2" --session "<session>"
python design_sync.py protect unblock "1:2" --session "<session>"
```

### Sửa layer

```json
{
  "edits": [
    {"nodeId": "12:34", "expect": {"characters": "Tiếp tục"}, "set": {"characters": "Xác nhận"}},
    {"nodeId": "12:36", "set": {"itemSpacing": 16, "size": {"width": 360, "height": 120}}}
  ]
}
```

Thay đổi hỗ trợ tên, chữ một font, font, bố cục, kích thước, fill/stroke, style ID, property của instance và binding biến. `componentProperties` dùng đúng khóa property đầy đủ từ cây layer. `fills` và `strokes` nhận danh sách `{"color":"#RRGGBB","opacity":1}` hoặc `{"variableId":"VariableID:1:7"}`. `bindings` nhận cặp trường và variable ID hoặc null. Dùng `expect` để buộc thuộc tính còn đúng giá trị đã đọc.

`edit` ghi ngay khi toàn bộ thay đổi nằm trong một màn. `stage` dùng cùng schema cho sửa hàng loạt. Nó hiện các màn, layer và đích bị cấm, rồi chờ nút **Cập nhật** trong plugin. Nếu đích, giá trị hoặc quyền đã đổi từ lúc xem, chuẩn bị lại lượt cập nhật. `status` trả trạng thái lượt.

Khi sửa component gốc, danh sách hiện từng instance theo màn. **Kế thừa** liệt kê thuộc tính nhận thay đổi. **Giữ override** liệt kê thuộc tính đang có giá trị riêng trên đúng layer. Một instance có thể xuất hiện với cả hai nhãn nếu sửa nhiều thuộc tính. **Cần kiểm tra** xuất hiện khi plugin chưa xác định được thuộc tính có kế thừa hay không, ví dụ chữ đi qua component property. `impact <node-id>` liệt kê các instance và override của layer đã chọn để đọc trước khi lập lô.

Để sửa biến cục bộ, dùng mục `{"variableId":"VariableID:1:7","modeId":"1:0","value":"#3778E5"}` trong `edits`. Dò phạm vi bằng `impact "VariableID:1:7" --variable --session "<session>"`. ID mode lấy từ `modeIds` trong `tokens.json`.

### Tạo màn

```json
{
  "parentId": "1:2",
  "name": "Xác nhận đơn hàng",
  "set": {"size": {"width": 393, "height": 852}, "fills": [{"variableId": "VariableID:1:7"}]},
  "children": [
    {"type": "TEXT", "set": {"x": 24, "y": 24, "characters": "Đơn hàng của bạn", "fontSize": 24}},
    {"type": "INSTANCE", "componentId": "3:5", "set": {"x": 24, "y": 96}}
  ]
}
```

Đích có thể là page, Section hoặc frame. Dùng `FRAME`, `TEXT`, `RECTANGLE`, `ELLIPSE` và `INSTANCE` cho layer con. Để dùng màn hiện có làm nền, truyền `cloneFrom` là ID frame thay cho `children`. `overrides` tùy chọn nhận `{"path":[0,1],"expectName":"Tiêu đề","set":{"characters":"Xác nhận"}}`, lần lượt theo chỉ số con bắt đầu từ 0. Màn mới có thể đọc và dùng lại ngay trong Figma.

Với ảnh người dùng cung cấp, dùng `SVG` kèm `svg` để nhập vector hoặc `IMAGE` kèm `base64` cho ảnh thành phần. Tách phần bố cục, chữ và component thành các layer chỉnh được.

Page cấm ghi vẫn đọc được. Thao tác cấm và gỡ cấm theo đúng page ID. Khi sửa thư viện ở một page khác, instance trên page bị cấm vẫn nhận thay đổi kế thừa.

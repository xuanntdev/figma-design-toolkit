# Design Sync Toolkit cho Figma

Bộ công cụ giúp dev, BA và trợ lý AI dựng màn hình chỉnh sửa được trên Figma Desktop **chỉ bằng một nút bấm**. Màn được viết bằng code, build thành plugin Figma chạy **cục bộ 100%** (không server, không mạng). Yêu cầu: Git, Figma Desktop, Python 3.10+.

## Cách hoạt động

```mermaid
flowchart LR
    Edit["Sửa màn trong project/"] --> Build["python design_sync.py build"]
    Build --> Figma["Mở plugin của dự án trong Figma"]
    Figma --> Click["Bấm Cập nhật → dựng vào Hiện tại / Cải tiến"]
    Click -.-> Undo["Hoàn tác nếu cần"]
```

- Mỗi team **clone kit thành repo của mình**; màn và cấu hình (tên plugin, cỡ khung, khung đích) nằm trong `project/` và được commit chung.
- Plugin không ghi đè bản đã duyệt và phần designer tự chỉnh; tự nhận bố cục Section **Hiện tại / Cải tiến** có sẵn trong file Figma.
- **Không áp đặt một cách làm.** Chọn trong `design-sync.json`: *sửa trực tiếp* trên khu Hiện tại (`target: "current"`, `layout: "sections"`, `sync: "merge"`…) hoặc *sinh màn mới / bản đề xuất* vào khu Cải tiến (`target: "improved"`, `layout: "grid"`, `sync: "replace"`), hoặc dùng cả hai. Cây Section chọn cấp, merge 3 chiều + Xem trước, nhãn màn, tự dọn khu thừa, trang Token & Component đều **tuỳ chọn**, mặc định tắt: xem [workflow.md](docs/workflow.md).
- Dự án lớn: dữ liệu snapshot theo nhóm (`snapshot-dir`), build theo nhóm; web có sẵn thì chụp thành snapshot bằng `capture/` (tuỳ chọn).

## Bắt đầu nhanh

```sh
git clone https://github.com/xuanntdev/figma-design-toolkit.git my-app-design
cd my-app-design
python design_sync.py init --name "Tên dự án"
python design_sync.py build
```

Trong Figma Desktop: **Plugins → Development → Import plugin from manifest…** → `project/dist/manifest.json`, mở plugin rồi bấm **Cập nhật**.

Đưa lên repo của team, bảng cấu hình và bảng lệnh: xem [docs/setup.md](docs/setup.md).

## Tài liệu

- [**Nguyên tắc thiết kế khi sinh màn** (component dùng chung là bắt buộc, token chuẩn Figma…)](docs/nguyen-tac.md)
- [Cài đặt, làm việc nhóm & cấu hình dự án](docs/setup.md)
- [Hai cách dùng điển hình, Hiện tại / Cải tiến & bảo vệ bản duyệt](docs/workflow.md)
- [Mẫu prompt cho AI (Cursor / Claude / Codex / AGY)](docs/ai-prompts.md)
- [Chụp web thành snapshot bằng Playwright (`capture/`, tuỳ chọn)](docs/capture.md)
- [Script mẫu chụp giao diện Web Sáng/Tối bằng Playwright](docs/capture-web.mjs)

[Thông báo giấy phép](LICENSE.upstream.txt)

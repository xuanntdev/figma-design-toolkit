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
- **Đồng bộ kiểu git theo màn**: bấm Cập nhật = **Xem trước** (bỏ qua / dựng mới / thay mới / giữ sửa tay / xung đột) → **Áp dụng**; màn sửa tay không bao giờ bị ghi đè, xung đột giải ngay trong plugin, **Xuất thay đổi** ra JSON.
- **Cây Section khu → nhóm → luồng → frame** (`target: "current"`), nhãn mã + tên màn trên canvas, dự án chỉ cần khu Hiện tại (`improved: false`) tự dọn Cải tiến/Tối.
- Dự án lớn: dữ liệu snapshot theo nhóm (`snapshot-dir`), build theo nhóm; trang **Token & Component** tuỳ chọn qua hook `buildTokens`; web có sẵn thì chụp thành snapshot bằng `capture/` (tuỳ chọn).

## Bắt đầu nhanh

```sh
git clone https://github.com/xuanntdev/figma-design-toolkit.git my-app-design
cd my-app-design
python design_sync.py init --name "Tên dự án"
python design_sync.py build
```

Trong Figma Desktop: **Plugins → Development → Import plugin from manifest…** → `project/dist/manifest.json`, mở plugin rồi bấm **Cập nhật**.

Đưa lên repo của team, cấu hình và bảng lệnh: xem [docs/setup.md](docs/setup.md).

## Tài liệu

- [Cài đặt, làm việc nhóm & cấu hình dự án](docs/setup.md)
- [Quy ước Hiện tại / Cải tiến & bảo vệ bản duyệt](docs/workflow.md)
- [Mẫu prompt cho AI (Cursor / Claude / Codex / AGY)](docs/ai-prompts.md)
- [Chụp web thành snapshot bằng Playwright (`capture/`, tuỳ chọn)](docs/capture.md)
- [Script mẫu chụp giao diện Web Sáng/Tối bằng Playwright](docs/capture-web.mjs)

[Thông báo giấy phép](LICENSE.upstream.txt)

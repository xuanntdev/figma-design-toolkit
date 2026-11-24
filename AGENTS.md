# Figma Design Toolkit

Khi người dùng yêu cầu setup Figma, dựng màn, đọc hoặc sửa layer đang chọn, hoặc áp dụng thay đổi cho nhiều màn, đọc [skill figma-design](.agents/skills/figma-design/SKILL.md). Chạy CLI bằng `python design_sync.py`. [Lệnh và JSON](docs/figma-live.md).

Chỉ truy cập thiết kế qua plugin Development do người dùng import từ `project/dist/manifest.json` trong Figma Desktop. Dùng CLI của toolkit qua cầu nối `localhost`. Không gọi Figma REST API, không dùng Figma MCP và không yêu cầu access token Figma.

Figma đã ghép là nguồn thiết kế. Giữ cấu hình dự án trong `project/design-sync.json` và kỹ thuật dựng trong `project/extension/`. Bản đọc từ plugin nằm ở `project/figma-state/`. Khi sửa kit, chạy `python verify_release.py`.

"""Kiểm thử toàn diện bản phát hành cục bộ (không cầu nối) của Design Sync Toolkit."""

import argparse
import base64
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLU8AAAAASUVORK5CYII="


def verify_kit(kit: Path, work: Path, packaged: bool) -> None:
    work.mkdir()
    cli = [sys.executable, "-SB", str(kit / "design_sync.py")]

    # 1. Không truyền gì: build dựng plugin mẫu example/ (các bước 2–4); dự án team kiểm ở verify_project
    # 2. Kiểm tra manifest ảnh chụp tham chiếu
    captures = work / "captures"
    (captures / "current/light").mkdir(parents=True)
    (captures / "current/light/welcome.png").write_bytes(base64.b64decode(PNG))
    subprocess.run([*cli, "manifest", "--root", "captures", "--version", "1.0.0", "--commit", "demo"], cwd=work, check=True)
    assert (captures / "current/manifest.json").is_file()

    # 3. Kiểm tra build lặp cho kết quả giống từng byte & manifest hoàn toàn offline
    example = str(kit / "example")
    subprocess.run([*cli, "build", "--extension", example, "--out", "built"], cwd=work, check=True)
    subprocess.run([*cli, "build", "--extension", example, "--out", "rebuilt"], cwd=work, check=True)
    for name in ("manifest.json", "code.js", "ui.html"):
        contents = (work / "built" / name).read_bytes()
        assert contents == (work / "rebuilt" / name).read_bytes(), name
        if packaged:
            assert contents == (kit / "plugin" / name).read_bytes(), name

    plugin_manifest = json.loads((work / "built/manifest.json").read_text(encoding="utf-8"))
    assert plugin_manifest["networkAccess"] == {"allowedDomains": ["none"]}, plugin_manifest["networkAccess"]
    assert "devAllowedDomains" not in plugin_manifest["networkAccess"]

    ui = (work / "built/ui.html").read_text(encoding="utf-8")
    assert '<html lang="vi">' in ui and "Đồng bộ thiết kế" in ui and "Cập nhật" in ui and "Hoàn tác" in ui
    assert "bridge" not in ui.lower() and "localhost" not in ui.lower()

    bundle = work / "built/code.js"
    code_text = bundle.read_text(encoding="utf-8")
    assert "DRAFT_PLAN" in code_text and "Chào mừng" in code_text

    # 4. Kiểm giới hạn kích thước file/hàm + cú pháp Node + kiểm giả lập toàn luồng plugin
    subprocess.run([*cli, "check", "--extension", str(kit / "example"), "--bundle", str(bundle)], cwd=work, check=True)
    subprocess.run([*cli, "check", "--extension", str(kit / "kit_core/plugin/core")], cwd=work, check=True)
    subprocess.run(["node", str(kit / "verify_plugin.js"), str(bundle)], cwd=work, check=True)

    verify_project(kit, work)


def verify_project(kit: Path, work: Path) -> None:
    # 5. Dự án team tại <kit>/project/ (chạy trên bản sao kit để không ghi vào kit thật)
    team_kit = work / "team-kit"
    top_level = {".git", "plugin", "dist", "project"}
    shutil.copytree(kit, team_kit, ignore=lambda d, names: [n for n in names if n == "__pycache__" or (Path(d) == kit and n in top_level)])
    cli = [sys.executable, "-SB", str(team_kit / "design_sync.py")]
    no_name = subprocess.run([*cli, "init"], cwd=team_kit, capture_output=True, text=True)
    assert no_name.returncode != 0 and "--name" in no_name.stderr and not (team_kit / "project").exists(), no_name.stderr
    subprocess.run([*cli, "init", "--name", "Team Web", "--frame", "1280x800", "--target", "current"], cwd=team_kit, check=True)
    project = team_kit / "project"
    assert (project / "extension/01-screens.js").is_file() and (project / "draft-plan.json").is_file()
    cfg = json.loads((project / "design-sync.json").read_text(encoding="utf-8"))
    assert cfg == {"name": "Team Web", "id": "team-web", "frame": "1280x800", "target": "current", "labels": {}}, cfg
    again = subprocess.run([*cli, "init", "--name", "Khác"], cwd=team_kit, capture_output=True, text=True)
    assert again.returncode == 1 and "Đã có dự án" in again.stderr, again.stderr

    # 6. build/check không cần cờ, chạy từ bất kỳ thư mục nào: tên plugin, cỡ khung, khung đích theo design-sync.json
    subprocess.run([*cli, "build"], cwd=work, check=True)
    assert_project_build(project / "dist", "Team Web", "team-web", 1280, "current")
    subprocess.run([*cli, "check"], cwd=team_kit, check=True)
    subprocess.run(["node", str(team_kit / "verify_plugin.js"), str(project / "dist/code.js")], cwd=work, check=True)
    ignored = (team_kit / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert "/project/" not in ignored and "/project/dist/" in ignored, "project/ phải commit được, project/dist/ thì không"


def assert_project_build(out: Path, name: str, plugin_id: str, width: int, target: str) -> None:
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["name"] == name and manifest["id"] == plugin_id, manifest
    code = (out / "code.js").read_text(encoding="utf-8")
    runtime = json.loads(next(l for l in code.splitlines() if l.startswith("const DESIGN_CONFIG = "))[22:-1])
    assert runtime["name"] == name and runtime["frame"]["width"] == width and runtime["target"] == target, runtime
    assert f"<h1>{name}</h1>" in (out / "ui.html").read_text(encoding="utf-8")


def verify(archive_path: Path | None) -> None:
    with TemporaryDirectory(prefix="design-sync-smoke-") as temp:
        base = Path(temp)
        kit = Path(__file__).resolve().parent
        if archive_path:
            with ZipFile(archive_path) as archive:
                archive.extractall(base)
            kit = base / archive_path.stem
        verify_kit(kit, base / "run", packaged=archive_path is not None)
    print("Đạt toàn bộ kiểm thử: init, build lặp offline, check kích thước, gương Section, bảo toàn chosen & hoàn tác an toàn.")
    if archive_path:
        print("SHA-256:", hashlib.sha256(archive_path.read_bytes()).hexdigest())


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, nargs="?")
    args = parser.parse_args()
    verify(args.archive.resolve() if args.archive else None)

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

from verify_config import SCENARIO_A, tree_plan, verify_options, verify_scenarios

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

    bundle = verify_built_files(work)

    # 4. Kiểm giới hạn kích thước file/hàm + cú pháp Node + kiểm giả lập toàn luồng plugin
    subprocess.run([*cli, "check", "--extension", str(kit / "example"), "--bundle", str(bundle)], cwd=work, check=True)
    subprocess.run([*cli, "check", "--extension", str(kit / "kit_core/plugin/core")], cwd=work, check=True)
    subprocess.run(["node", str(kit / "verify_plugin.js"), str(bundle)], cwd=work, check=True)

    verify_snapshot_dir(kit, work)
    verify_layout(kit, work)
    verify_simulation(kit, work, bundle)
    verify_scenarios(kit, work)
    verify_options(kit, work)
    verify_project(kit, work)


def verify_built_files(work: Path) -> Path:
    # 3b. manifest không mở mạng, ui.html offline, bundle có plan và màn mẫu. Trả đường dẫn code.js.
    plugin_manifest = json.loads((work / "built/manifest.json").read_text(encoding="utf-8"))
    assert plugin_manifest["networkAccess"] == {"allowedDomains": ["none"]}, plugin_manifest["networkAccess"]
    assert "devAllowedDomains" not in plugin_manifest["networkAccess"]

    ui = (work / "built/ui.html").read_text(encoding="utf-8")
    assert '<html lang="vi">' in ui and "Đồng bộ thiết kế" in ui and "Cập nhật" in ui and "Hoàn tác" in ui
    assert "bridge" not in ui.lower() and "localhost" not in ui.lower()

    bundle = work / "built/code.js"
    code_text = bundle.read_text(encoding="utf-8")
    assert "DRAFT_PLAN" in code_text and "Chào mừng" in code_text
    return bundle


def verify_snapshot_dir(kit: Path, work: Path) -> None:
    # 4b. Loại dữ liệu snapshot-dir: group.json + <stem>.json nhúng vào registry/index khai báo ở mô-đun .js
    sys.path.insert(0, str(kit))
    from kit_core import build

    snaps = work / "snaps" / "g1"
    ext = work / "snap-ext"
    (ext / "data").mkdir(parents=True)
    snaps.mkdir(parents=True)
    (snaps / "group.json").write_text(json.dumps({"id": "g1", "title": "Nhóm", "order": 5, "screens": [{"stem": "g1-a", "title": "Màn A"}]}), encoding="utf-8")
    (snaps / "g1-a.json").write_text(json.dumps({"id": "g1-a", "w": 1440}), encoding="utf-8")
    (ext / "00-registry.js").write_text("var SNAPS = {};\nvar GROUPS = [];\n", encoding="utf-8")
    spec = {"kind": "snapshot-dir", "dir": "../../snaps/g1", "registry": "SNAPS", "index": "GROUPS"}
    (ext / "data" / "g1.gen.json").write_text(json.dumps(spec), encoding="utf-8")
    text = build.render_module(ext / "data" / "g1.gen.json")
    assert 'SNAPS["g1-a"] = {"id":"g1-a","w":1440};' in text and 'GROUPS.push({"id": "g1", "title": "Nhóm"' in text, text
    assert build.collect(ext)[-1].name == "g1.gen.json"

    # exclude: stem bị loại khỏi cả registry lẫn group.screens; thiếu trường thì như cũ
    (snaps / "group.json").write_text(json.dumps({"id": "g1", "title": "Nhóm", "order": 5, "screens": [{"stem": "g1-a", "title": "Màn A"}, {"stem": "g1-b", "title": "Màn B"}]}), encoding="utf-8")
    (snaps / "g1-b.json").write_text(json.dumps({"id": "g1-b"}), encoding="utf-8")
    full = build.render_module(ext / "data" / "g1.gen.json")
    assert 'SNAPS["g1-b"]' in full and '"stem": "g1-b"' in full
    (ext / "data" / "g1.gen.json").write_text(json.dumps({**spec, "exclude": ["g1-b"]}), encoding="utf-8")
    cut = build.render_module(ext / "data" / "g1.gen.json")
    assert 'SNAPS["g1-a"]' in cut and 'g1-b' not in cut, cut


def verify_layout(kit: Path, work: Path) -> None:
    # 4c. improved=false (chỉ khu Hiện tại) + xếp hàng không đè, trên extension thử tests/layout-extension
    sys.path.insert(0, str(kit))
    from kit_core import config

    # Kịch bản A (sửa trực tiếp) với mọi tính năng nâng cao bật: cây Section, merge, nhãn chữ, dọn khu
    runtime = config.runtime({**SCENARIO_A, "frame": {"width": 100, "height": 100, "perRow": 3}, "screenLabels": True, "cleanup": True})
    assert runtime["improved"] is False and config.runtime({})["improved"] is True
    for bad in ({"improved": False, "target": "improved"}, {"improved": False}, {"improved": "no"}):
        try:
            config.validate(bad, Path("design-sync.json"))
        except ValueError:
            continue
        raise AssertionError(f"Cấu hình sai phải bị từ chối: {bad}")
    from kit_core import build

    build.build([kit / "tests" / "layout-extension"], work / "layout-out", runtime=runtime)
    subprocess.run(["node", str(kit / "verify_layout.js"), str(work / "layout-out/code.js")], check=True)
    plan = {"screenIds": ["g1-a"], "themes": ["light"], "replace": True, "groupOrders": {"gx": {"order": 3, "title": "3 · Mới"}}}
    build.build([kit / "tests" / "layout-extension"], work / "cleanup-out", runtime=runtime, plan=plan)
    subprocess.run(["node", str(kit / "verify_cleanup.js"), str(work / "cleanup-out/code.js")], check=True)
    verify_merge(kit, work, runtime)
    verify_tree(kit, work, runtime)


def verify_merge(kit: Path, work: Path, runtime: dict) -> None:
    # 4d. Merge 3 chiều theo màn: v1 = extension thử, v1b = cùng extension plan khác (lô khác), v2 = nguồn g1-b/g1-d đổi
    from kit_core import build

    ext = kit / "tests" / "layout-extension"
    ext2 = work / "merge-ext2"
    ext2.mkdir()
    text = (ext / "01-ext.js").read_text(encoding="utf-8")
    assert "['b', 300]" in text and "['d', 100]" in text
    (ext2 / "01-ext.js").write_text(text.replace("['b', 300]", "['b', 310]").replace("['d', 100]", "['d', 110]"), encoding="utf-8")
    plan = {"themes": ["light"], "replace": True}
    build.build([ext], work / "merge-v1", runtime=runtime, plan={**plan, "screenIds": ["g1-a"]})
    build.build([ext], work / "merge-v1b", runtime=runtime, plan={**plan, "screenIds": ["g1-a", "g1-c"]})
    build.build([ext2], work / "merge-v2", runtime=runtime, plan={**plan, "screenIds": ["g1-b"]})
    bundles = [str(work / name / "code.js") for name in ("merge-v1", "merge-v1b", "merge-v2")]
    subprocess.run(["node", str(kit / "verify_merge.js"), *bundles], check=True)


def verify_tree(kit: Path, work: Path, runtime: dict) -> None:
    # 4e. Cây Section khu -> nhóm -> luồng: plan 1 (g1,g3 = KHU A, g2 = KHU B) và plan 2 (đổi khu + luồng) trên extension thử
    from kit_core import build

    f1 = {
        "g1": [("f1", "LUỒNG MỘT", ["g1-a", "g1-b"]), ("f2", "LUỒNG HAI", ["g1-c"]), ("f3", "LUỒNG BA", ["g1-d"]), ("f4", "LUỒNG BỐN", ["g1-e"])],
        "g2": [("x1", "LUỒNG X", ["g2-a", "g2-b"])],
        "g3": [("p0", "LUỒNG ĐẦU", ["g3-c"]), ("p1", "LUỒNG P", ["g3-a", "g3-b"])],
    }
    f2 = {**f1, "g1": [("f1", "LUỒNG MỘT", ["g1-a", "g1-b", "g1-e"]), ("f2", "LUỒNG HAI", ["g1-c"]), ("f3", "LUỒNG BA", ["g1-d"])]}
    ext = kit / "tests" / "layout-extension"
    build.build([ext], work / "tree1", runtime=runtime, plan=tree_plan({"g1": "KHU A", "g2": "KHU B", "g3": "KHU A"}, f1))
    build.build([ext], work / "tree2", runtime=runtime, plan=tree_plan({"g1": "KHU B", "g2": "KHU A", "g3": "KHU B"}, f2))
    subprocess.run(["node", str(kit / "verify_tree.js"), str(work / "tree1/code.js"), str(work / "tree2/code.js")], check=True)


def verify_simulation(kit: Path, work: Path, example_bundle: Path) -> None:
    # 4f. verify_project.js: dựng hết màn trong plan (đủ/thiếu font), chạy lại ổn định; extension thử có thêm hook buildTokens
    subprocess.run(["node", str(kit / "verify_project.js"), str(example_bundle)], check=True)
    from kit_core import build

    ext = kit / "tests" / "token-extension"
    plan = json.loads((ext / "draft-plan.json").read_text(encoding="utf-8"))
    from kit_core import config

    for name, options in (("default", {}), ("merge-update", {"sync": "merge", "tokens": "update"}), ("off", {"tokens": "off"})):
        out = work / f"token-{name}"
        build.build([ext], out, runtime=config.runtime(options), plan=plan)
        subprocess.run(["node", str(kit / "verify_project.js"), str(out / "code.js")], check=True)


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

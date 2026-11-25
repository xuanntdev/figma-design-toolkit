"""Kiểm thử toàn diện bản phát hành của Design Sync Toolkit (cục bộ; cầu nối localhost chỉ khi dự án bật bridge)."""

import base64
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from tests.verify_config import SCENARIO_A, tree_plan, verify_gen_plan, verify_options, verify_scenarios
from tests.verify_live import verify_live_cli

PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLU8AAAAASUVORK5CYII="


def verify_kit(kit: Path, work: Path) -> None:
    work.mkdir()
    cli = [sys.executable, "-SB", str(kit / "design_sync.py")]

    # Kiểm tra manifest ảnh chụp tham chiếu
    captures = work / "captures"
    (captures / "current/light").mkdir(parents=True)
    (captures / "current/light/welcome.png").write_bytes(base64.b64decode(PNG))
    subprocess.run([*cli, "manifest", "--root", "captures", "--version", "1.0.0", "--commit", "demo"], cwd=work, check=True)
    assert (captures / "current/manifest.json").is_file()

    # Kiểm tra build lặp cho kết quả giống từng byte & manifest hoàn toàn offline
    fixture = str(kit / "tests/builder-extension")
    subprocess.run([*cli, "build", "--extension", fixture, "--out", "built"], cwd=work, check=True)
    subprocess.run([*cli, "build", "--extension", fixture, "--out", "rebuilt"], cwd=work, check=True)
    for name in ("manifest.json", "code.js", "ui.html"):
        contents = (work / "built" / name).read_bytes()
        assert contents == (work / "rebuilt" / name).read_bytes(), name

    bundle = verify_built_files(work)

    # 4. Kiểm giới hạn kích thước file/hàm + cú pháp Node + kiểm giả lập toàn luồng plugin
    subprocess.run([*cli, "check", "--extension", fixture, "--bundle", str(bundle)], cwd=work, check=True)
    subprocess.run([*cli, "check", "--extension", str(kit / "kit_core/plugin/core")], cwd=work, check=True)
    subprocess.run(["node", str(kit / "tests/verify_plugin.js"), str(bundle)], cwd=work, check=True)

    verify_snapshot_dir(kit, work)
    verify_layout(kit, work)
    verify_simulation(kit, work, bundle)
    verify_scenarios(kit, work)
    verify_options(kit, work)
    verify_gen_plan(kit, work)
    verify_bridge(kit, work)
    subprocess.run(["node", str(kit / "tests/verify_live.js"), str(bundle)], cwd=work, check=True)
    verify_project(kit, work)


def verify_built_files(work: Path) -> Path:
    # Manifest không mở mạng, UI offline và bundle có dữ liệu kiểm thử.
    plugin_manifest = json.loads((work / "built/manifest.json").read_text(encoding="utf-8"))
    assert plugin_manifest["networkAccess"] == {"allowedDomains": ["none"]}, plugin_manifest["networkAccess"]
    assert "devAllowedDomains" not in plugin_manifest["networkAccess"]

    ui = (work / "built/ui.html").read_text(encoding="utf-8")
    assert '<html lang="vi">' in ui and "Đồng bộ thiết kế" in ui and "Cập nhật" in ui and "Hoàn tác" in ui
    assert "bridge" not in ui.lower() and "localhost" not in ui.lower() and "fetch(" not in ui, "không khai bridge thì UI không có đường ra mạng"
    assert 'data-mode="design"' in ui and "Xuất trạng thái" not in ui and "Gửi về repo" not in ui

    bundle = work / "built/code.js"
    code_text = bundle.read_text(encoding="utf-8")
    assert "DRAFT_PLAN" in code_text and "Màn kiểm thử" in code_text
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
    subprocess.run(["node", str(kit / "tests/verify_layout.js"), str(work / "layout-out/code.js")], check=True)
    plan = {"screenIds": ["g1-a"], "themes": ["light"], "replace": True, "groupOrders": {"gx": {"order": 3, "title": "3 · Mới"}}}
    build.build([kit / "tests" / "layout-extension"], work / "cleanup-out", runtime=runtime, plan=plan)
    subprocess.run(["node", str(kit / "tests/verify_cleanup.js"), str(work / "cleanup-out/code.js")], check=True)
    verify_merge(kit, work, runtime)
    verify_tree(kit, work, runtime)
    verify_link(kit, work, runtime)
    verify_link_sample(kit, work)


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
    subprocess.run(["node", str(kit / "tests/verify_merge.js"), *bundles], check=True)


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
    batch = tree_plan({"g1": "KHU A", "g2": "KHU B", "g3": "KHU A"}, {"g2": f1["g2"]})  # lô chỉ có luồng của nhóm g2
    build.build([ext], work / "tree3", runtime=runtime, plan=batch)
    bundles = [str(work / name / "code.js") for name in ("tree1", "tree2", "tree3")]
    subprocess.run(["node", str(kit / "tests/verify_tree.js"), *bundles], check=True)


def verify_link(kit: Path, work: Path, runtime: dict) -> None:
    # 4f. Engine link (kit_core/plugin/core/07k..07o) với luật giả: instance + matchRun + token + vân tay ổn định, cả sync=merge lẫn sync=replace;
    # extension chỉ khai token thì chỉ gắn biến, không khai gì thì chỉ khối thô
    from kit_core import build, config

    assert "link" not in runtime, "Engine link bắt buộc, không có cờ bật/tắt"
    plan = {"screenIds": ["g1-a", "g1-b"], "themes": ["light"], "replace": True}
    ext = kit / "tests" / "link-extension"
    text = (ext / "01-ext.js").read_text(encoding="utf-8")
    assert "linkRules: FAKE_RULES," in text and "linkTokens: FAKE_TOKENS," in text
    variants = {"tokens-only": text.replace("linkRules: FAKE_RULES,", "linkRules: [],"), "none": text.replace("linkRules: FAKE_RULES,", "").replace("linkTokens: FAKE_TOKENS,", "")}
    for name, code in variants.items():
        (work / f"link-{name}-ext").mkdir()
        (work / f"link-{name}-ext" / "01-ext.js").write_text(code, encoding="utf-8")
    build.build([ext], work / "link-full", runtime=runtime, plan=plan)
    for name in variants:
        build.build([work / f"link-{name}-ext"], work / f"link-{name}", runtime=runtime, plan=plan)
    bundles = [str(work / name / "code.js") for name in ("link-full", "link-tokens-only", "link-none")]
    subprocess.run(["node", str(kit / "tests/verify_link.js"), "merge", *bundles], check=True)
    build.build([ext], work / "link-replace", runtime=config.runtime({}), plan=plan)
    subprocess.run(["node", str(kit / "tests/verify_link.js"), "replace", str(work / "link-replace/code.js")], check=True)


def verify_link_sample(kit: Path, work: Path) -> None:
    # 4g. Ví dụ link (capture/link-example) dựng trên snapshot của capture/sample-site (tests/link-sample): instance Button / Tag / App/Header + token,
    # và công cụ quét khối lặp capture/find-repeats.mjs trên cùng snapshot
    from kit_core import build, config

    for folder in ("capture/extension", "capture/link-example"):
        subprocess.run([sys.executable, "-SB", str(kit / "design_sync.py"), "check", "--extension", str(kit / folder)], check=True)
    data = work / "link-sample-data"
    (data / "data").mkdir(parents=True)
    spec = {"kind": "snapshot-dir", "dir": str(kit / "tests/link-sample/sample"), "registry": "SNAP_SNAPSHOTS", "index": "SNAP_GROUPS"}
    (data / "data" / "sample.gen.json").write_text(json.dumps(spec), encoding="utf-8")
    plan = {"screenIds": ["sample-danh-sach", "sample-chi-tiet"], "themes": ["light"], "replace": True}
    dirs = [kit / "capture/extension", kit / "capture/link-example", data]
    build.build(dirs, work / "link-sample", runtime=config.runtime({"target": "current"}), plan=plan)
    subprocess.run(["node", str(kit / "tests/verify_link_sample.js"), "example", str(work / "link-sample/code.js")], check=True)
    build.build(dirs[:1] + [data], work / "link-sample-bare", runtime=config.runtime({"target": "current"}), plan=plan)
    subprocess.run(["node", str(kit / "tests/verify_link_sample.js"), "bare", str(work / "link-sample-bare/code.js")], check=True)
    found = subprocess.run(["node", str(kit / "capture/find-repeats.mjs"), "--dir", str(kit / "tests/link-sample"), "--min-screens", "2"], capture_output=True, text=True)
    assert found.returncode == 0 and "section.card" in found.stdout and "header" in found.stdout, found.stdout + found.stderr


def verify_simulation(kit: Path, work: Path, example_bundle: Path) -> None:
    # 4f. verify_project.js: dựng hết màn trong plan (đủ/thiếu font), chạy lại ổn định; extension thử có thêm hook buildTokens
    subprocess.run(["node", str(kit / "tests/verify_project.js"), str(example_bundle)], check=True)
    from kit_core import build

    ext = kit / "tests" / "token-extension"
    plan = json.loads((ext / "draft-plan.json").read_text(encoding="utf-8"))
    from kit_core import config

    for name, options in (("default", {}), ("merge-update", {"sync": "merge", "tokens": "update"}), ("off", {"tokens": "off"})):
        out = work / f"token-{name}"
        build.build([ext], out, runtime=config.runtime(options), plan=plan)
        subprocess.run(["node", str(kit / "tests/verify_project.js"), str(out / "code.js")], check=True)


def verify_bridge(kit: Path, work: Path) -> None:
    # 4h. Chiều Figma -> repo: readState (thuần đọc) trên bundle extension thử có component/token; bridge tuỳ chọn (manifest + UI); cầu nối + pull + import-state + figma-diff
    from kit_core import build, config

    plan = {"screenIds": ["g1-a", "g1-b"], "themes": ["light"], "replace": True}
    runtime = config.runtime({"frame": {"width": 100, "height": 100, "perRow": 3}, "target": "current", "improved": False})
    assert "bridge" not in runtime and config.runtime({"bridge": {"port": 9123}})["bridge"] == {"port": 9123}
    assert "bridge" not in config.runtime({"bridge": None}) and "bridge" not in config.runtime({"bridge": False})
    for bad in ({"bridge": 1}, {"bridge": {"port": 80}}, {"bridge": {"port": "8787"}}, {"bridge": {"host": "0.0.0.0"}},
                {"readOnly": True}, {"readOnly": "true", "bridge": {"port": 9123}}):
        try:
            config.validate(bad, Path("design-sync.json"))
        except ValueError:
            continue
        raise AssertionError(f"Cấu hình bridge sai phải bị từ chối: {bad}")
    build.build([kit / "tests" / "link-extension"], work / "state-off", runtime=runtime, plan=plan)
    build.build([kit / "tests" / "link-extension"], work / "state-on", runtime={**runtime, "bridge": {"port": 9123}}, plan=plan)
    audit = config.runtime({"readOnly": True, "bridge": {"port": 9123}})
    build.build([], work / "state-audit", runtime=audit)
    off = json.loads((work / "state-off/manifest.json").read_text(encoding="utf-8"))
    on = json.loads((work / "state-on/manifest.json").read_text(encoding="utf-8"))
    assert off["networkAccess"] == {"allowedDomains": ["none"]}
    assert on["networkAccess"]["allowedDomains"] == ["http://localhost:9123"] and on["networkAccess"]["reasoning"], on["networkAccess"]
    ui_off = (work / "state-off/ui.html").read_text(encoding="utf-8")
    ui_on = (work / "state-on/ui.html").read_text(encoding="utf-8")
    assert "Gửi về repo" not in ui_on and "Xuất trạng thái" not in ui_on
    assert "http://localhost:9123" in ui_on and "__BRIDGE_PORT__" not in ui_on and "/pending" in ui_on
    assert "Gửi về repo" not in ui_off and "localhost" not in ui_off and "fetch(" not in ui_off
    ui_audit = (work / "state-audit/ui.html").read_text(encoding="utf-8")
    assert 'data-mode="read"' in ui_audit and "/pending" in ui_audit and "function runApply()" not in ui_audit
    subprocess.run(["node", str(kit / "tests/verify_window.js"), str(work / "state-off"), str(work / "state-audit")], check=True)
    state_out = work / "state-out"
    subprocess.run(["node", str(kit / "tests/verify_state.js"), str(work / "state-off/code.js")], check=True, env={**os.environ, "STATE_OUT_DIR": str(state_out)})
    subprocess.run(["node", str(kit / "tests/verify_state.js"), str(work / "state-on/code.js")], check=True)
    subprocess.run(["node", str(kit / "tests/verify_state.js"), str(work / "state-audit/code.js"), "--read-only"], check=True)
    subprocess.run(["node", str(kit / "tests/verify_designer.js"), str(work / "state-off/code.js")], check=True)
    subprocess.run(["node", str(kit / "tests/verify_ui_timeout.js"), str(work / "state-on")], check=True)
    subprocess.run(["node", str(kit / "tests/verify_replace.js"), str(work / "state-off/code.js")], check=True)
    subprocess.run([sys.executable, "-B", str(kit / "tests/verify_spec.py")], check=True)
    subprocess.run([sys.executable, "-B", str(kit / "tests/verify_bridge.py"), str(state_out)], check=True)


def verify_project(kit: Path, work: Path) -> None:
    # 5. Dự án team tại <kit>/project/ (chạy trên bản sao kit để không ghi vào kit thật)
    team_kit = work / "team-kit"
    top_level = {".git", "plugin", "dist", "project"}
    shutil.copytree(kit, team_kit, ignore=lambda d, names: [n for n in names if n == "__pycache__" or (Path(d) == kit and n in top_level)])
    cli = [sys.executable, "-SB", str(team_kit / "design_sync.py")]
    subprocess.run([*cli, "build"], cwd=team_kit, check=True)
    core_bundle = team_kit / "plugin/code.js"
    assert "Màn kiểm thử" not in core_bundle.read_text(encoding="utf-8")
    subprocess.run([*cli, "check", "--bundle", str(core_bundle)], cwd=team_kit, check=True)
    no_name = subprocess.run([*cli, "init"], cwd=team_kit, capture_output=True, text=True)
    assert no_name.returncode != 0 and "--name" in no_name.stderr and not (team_kit / "project").exists(), no_name.stderr
    subprocess.run([*cli, "init", "--name", "Team Web", "--frame", "1280x800", "--target", "current"], cwd=team_kit, check=True)
    project = team_kit / "project"
    assert (project / "extension/.gitkeep").is_file()
    assert not list((project / "extension").glob("*.js"))
    assert json.loads((project / "draft-plan.json").read_text(encoding="utf-8"))["screenIds"] == []
    cfg = json.loads((project / "design-sync.json").read_text(encoding="utf-8"))
    assert cfg == {"name": "Team Web", "id": "team-web", "frame": "1280x800", "target": "current", "labels": {}, "bridge": {"port": 8787}}, cfg
    again = subprocess.run([*cli, "init", "--name", "Khác"], cwd=team_kit, capture_output=True, text=True)
    assert again.returncode == 1 and "Đã có dự án" in again.stderr, again.stderr
    fixture = team_kit / "tests/builder-extension"
    shutil.copyfile(fixture / "extension.js", project / "extension/01-screens.js")
    shutil.copyfile(fixture / "draft-plan.json", project / "draft-plan.json")

    # 6. build/check không cần cờ, chạy từ bất kỳ thư mục nào: tên plugin, cỡ khung, khung đích theo design-sync.json
    subprocess.run([*cli, "build"], cwd=work, check=True)
    assert_project_build(project / "dist", "Team Web", "team-web", 1280, "current")
    subprocess.run([*cli, "check"], cwd=team_kit, check=True)
    subprocess.run(["node", str(team_kit / "tests/verify_plugin.js"), str(project / "dist/code.js")], cwd=work, check=True)
    # 6b. init bật sẵn bridge: manifest chỉ cho đúng http://localhost:8787, UI tự nhận yêu cầu đọc.
    assert json.loads((project / "dist/manifest.json").read_text(encoding="utf-8"))["networkAccess"]["allowedDomains"] == ["http://localhost:8787"]
    verify_live_cli(team_kit)
    # 6c. Bỏ khoá bridge (hoặc đặt null) = tắt: manifest ["none"], UI không có mã mạng, pull từ chối và không mở cổng nào
    for explicit_null in (False, True):
        no_bridge = {k: v for k, v in cfg.items() if k != "bridge"}
        if explicit_null:
            no_bridge["bridge"] = None
        (project / "design-sync.json").write_text(json.dumps(no_bridge), encoding="utf-8")
        subprocess.run([*cli, "build"], cwd=work, check=True)
        assert json.loads((project / "dist/manifest.json").read_text(encoding="utf-8"))["networkAccess"] == {"allowedDomains": ["none"]}
        ui_off = (project / "dist/ui.html").read_text(encoding="utf-8")
        assert "Gửi về repo" not in ui_off and "localhost" not in ui_off and "fetch(" not in ui_off
        refused = subprocess.run([*cli, "pull", "--timeout", "1"], cwd=team_kit, capture_output=True, text=True)
        assert refused.returncode == 1 and "chưa bật cầu nối" in refused.stderr, refused.stderr
    # 6d. Đổi cổng thì build theo cổng mới
    (project / "design-sync.json").write_text(json.dumps({**cfg, "bridge": {"port": 9456}}), encoding="utf-8")
    subprocess.run([*cli, "build"], cwd=work, check=True)
    assert json.loads((project / "dist/manifest.json").read_text(encoding="utf-8"))["networkAccess"]["allowedDomains"] == ["http://localhost:9456"]
    assert "http://localhost:9456" in (project / "dist/ui.html").read_text(encoding="utf-8")
    ignored = (team_kit / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert "/project/" not in ignored and "/project/dist/" in ignored, "project/ phải commit được, project/dist/ thì không"
    external_project = project.rename(work / "team-builder-project")
    verify_live_cli(team_kit, external_project)
    subprocess.run([*cli, "init", "--name", "Figma Live", "--empty"], cwd=team_kit, check=True)
    subprocess.run([*cli, "build"], cwd=team_kit, check=True)
    assert json.loads((project / "draft-plan.json").read_text(encoding="utf-8"))["screenIds"] == []
    assert not list((project / "extension").glob("*.js")), "Ghép file hiện có không cần builder mẫu"
    subprocess.run(["node", str(team_kit / "tests/verify_live.js"), str(project / "dist/code.js"), "--empty"], cwd=work, check=True)
    assert (team_kit / ".agents/skills/figma-design/SKILL.md").is_file()


def assert_project_build(out: Path, name: str, plugin_id: str, width: int, target: str) -> None:
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["name"] == name and manifest["id"] == plugin_id, manifest
    code = (out / "code.js").read_text(encoding="utf-8")
    runtime = json.loads(next(l for l in code.splitlines() if l.startswith("const DESIGN_CONFIG = "))[22:-1])
    assert runtime["name"] == name and runtime["frame"]["width"] == width and runtime["target"] == target, runtime
    assert f"<h1>{name}</h1>" in (out / "ui.html").read_text(encoding="utf-8")


def verify() -> None:
    with TemporaryDirectory(prefix="design-sync-smoke-") as temp:
        base = Path(temp)
        kit = Path(__file__).resolve().parent
        verify_kit(kit, base / "run")
    print("Đạt toàn bộ kiểm thử: init, build lặp offline, check kích thước, gương Section, bảo toàn chosen & hoàn tác an toàn.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    verify()

"""CLI dựng và kiểm thử plugin Design Sync Toolkit cho Figma (cục bộ 100%; cầu nối localhost chỉ chạy khi bật bridge)."""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from kit_core import bridge, bridge_client, build, config, figma_diff, figma_diff_render, manifest

BASE = Path(__file__).resolve().parent


def load_plan(plan_path: Path | None, extension: Path) -> dict | None:
    if plan_path is not None:
        if not plan_path.is_file():
            raise ValueError(f"Không tìm thấy tệp kế hoạch {plan_path}.")
        return json.loads(plan_path.read_text(encoding="utf-8"))
    default_plan = extension / "draft-plan.json"
    if default_plan.is_file():
        return json.loads(default_plan.read_text(encoding="utf-8"))
    return None


def build_plugin(
    extension: Path,
    output: Path,
    plan_path: Path | None = None,
    name: str = config.DEFAULT_NAME,
    plugin_id: str = config.DEFAULT_ID,
    runtime: dict | None = None,
) -> dict:
    plan = load_plan(plan_path, extension)
    return build.build([extension], output, plan=plan, name=name, plugin_id=plugin_id, runtime=runtime)


PROJECT = BASE / "project"
STATE_DIR = PROJECT / bridge.STATE_DIRNAME


def project_readme(cfg: dict) -> str:
    frame = config.parse_frame(cfg["frame"])
    return "\n".join([
        f"# {cfg['name']} · Thiết kế Figma",
        "",
        f"- Cấu hình: `{config.CONFIG_NAME}` — tên plugin, cỡ khung ({cfg['frame']}: {frame['width']}×{frame['height']}),"
        f" khung đích `{cfg['target']}` (improved = Cải tiến, current = Hiện tại), đổi tên khung qua `labels`.",
        "- Màn hình: `extension/01-screens.js`. Danh sách màn sẽ dựng: `draft-plan.json`.",
        "- `extension/01-screens.js` đang là **màn mẫu** `welcome`: thay bằng màn thật và sửa `draft-plan.json` trước khi bấm Cập nhật.",
        "",
        "1. Dựng plugin (đứng ở thư mục gốc của kit): `python design_sync.py build`",
        "2. Figma: Plugins → Development → Import plugin from manifest… → `project/dist/manifest.json` (chỉ làm 1 lần).",
        f"3. Mở plugin **{cfg['name']}** → bấm **Cập nhật**.",
        "4. Sửa xong thì commit thư mục `project/` và push lên repo của team để người khác pull về.",
        "",
        "Chiều ngược Figma → repo: `python design_sync.py pull` rồi `python design_sync.py figma-diff` (xem `docs/workflow.md` mục 6)."
        " `init` bật sẵn cầu nối localhost (`bridge` trong `design-sync.json`); bỏ khoá này hoặc đặt `null` để plugin hoàn toàn offline.",
        "",
    ])


def cmd_init(args: argparse.Namespace) -> None:
    if PROJECT.exists() and any(PROJECT.iterdir()):
        raise ValueError(f"Đã có dự án tại {PROJECT}. Sửa {PROJECT / config.CONFIG_NAME} thay vì init lại.")
    cfg = config.default_config(args.name, frame=args.frame, target=args.target)
    if args.id:
        cfg["id"] = args.id
    config.parse_frame(cfg["frame"])
    cfg["bridge"] = {"port": config.BRIDGE_DEFAULT_PORT}
    ext_dir = PROJECT / "extension"
    ext_dir.mkdir(parents=True, exist_ok=True)
    config.write(PROJECT, cfg)
    shutil.copyfile(BASE / "example" / "extension.js", ext_dir / "01-screens.js")
    shutil.copyfile(BASE / "example" / "draft-plan.json", PROJECT / "draft-plan.json")
    (PROJECT / ".gitignore").write_text("/dist/\n", encoding="utf-8")
    (PROJECT / "README.md").write_text(project_readme(cfg), encoding="utf-8")
    print(f"Đã khởi tạo dự án tại {PROJECT} · plugin \"{cfg['name']}\" · khung {cfg['frame']} · đích {cfg['target']}")


def resolve(args: argparse.Namespace) -> dict:
    """Có project/ (design-sync.json) thì dựng dự án; cờ truyền tay luôn thắng. Truyền --extension nghĩa là
    dựng thủ công (không đọc project/). Chưa init thì dựng plugin mẫu từ example/."""
    project = PROJECT if args.extension is None and (PROJECT / config.CONFIG_NAME).is_file() else None
    cfg = config.load(project) if project else {}
    return {
        "project": project,
        "extension": args.extension or (project / "extension" if project else BASE / "example"),
        "plan": getattr(args, "plan", None) or (project / "draft-plan.json" if project else None),
        "out": getattr(args, "out", None) or (project / "dist" if project else BASE / "plugin"),
        "name": getattr(args, "name", None) or cfg.get("name") or config.DEFAULT_NAME,
        "id": getattr(args, "id", None) or cfg.get("id") or config.DEFAULT_ID,
        "runtime": config.runtime(cfg) if project else None,
    }


def cmd_build(args: argparse.Namespace) -> None:
    r = resolve(args)
    info = build_plugin(r["extension"], r["out"], plan_path=r["plan"], name=r["name"], plugin_id=r["id"], runtime=r["runtime"])
    print(f"Đã dựng plugin \"{r['name']}\" tại {info['out']} (bản {info['version']}, {info['modules']} mô-đun).")
    if r["runtime"]:
        frame = r["runtime"]["frame"]
        print(f"Dự án {r['project']} · khung {frame['width']}×{frame['height']} · đích {r['runtime']['target']}")
    print(f"Import vào Figma: {Path(info['out']).resolve() / 'manifest.json'}")


def cmd_check(args: argparse.Namespace) -> None:
    r = resolve(args)
    extension = r["extension"]
    if not extension.is_dir():
        raise ValueError(f"Không tìm thấy thư mục extension {extension}.")
    files = build.collect(extension)
    problems = build.check(files)
    if problems:
        for item in problems:
            print(f"Vi phạm: {item}", file=sys.stderr)
        raise ValueError(f"Có {len(problems)} lỗi giới hạn kích thước mã nguồn.")
    bundle = args.bundle or (r["project"] / "dist" / "code.js" if r["project"] else None)
    if bundle and bundle.is_file():
        subprocess.run(["node", "--check", str(bundle)], check=True)
    print(f"Đạt kiểm tra {len(files)} tệp nguồn (≤ 300 dòng/file, ≤ 40 dòng/hàm).")


def cmd_manifest(args: argparse.Namespace) -> None:
    path = manifest.write_manifest(args.root, args.version, args.commit)
    print(f"Đã lưu {path}")


def state_dir(args: argparse.Namespace) -> Path:
    return args.state_dir or STATE_DIR


def bridge_port(args: argparse.Namespace, required: bool) -> int:
    """Cổng cầu nối: --port, rồi `bridge.port` trong design-sync.json; không có thì pull báo lỗi, serve dùng cổng mặc định."""
    if args.port:
        return args.port
    port = config.bridge_port(config.load(PROJECT))
    if port or not required:
        return port or config.BRIDGE_DEFAULT_PORT
    raise ValueError('Dự án chưa bật cầu nối: thêm "bridge": {"port": 8787} vào project/design-sync.json, build lại plugin; hoặc truyền --port.')


def describe(summary: dict, where: Path) -> str:
    return (f"Đã nhận trạng thái Figma: {summary.get('screens')} màn (sửa tay {summary.get('edited')}, vẽ tay {summary.get('handmade')}), "
            f"đọc lúc {summary.get('readAt')} -> {where}")


def cmd_serve(args: argparse.Namespace) -> None:
    bridge.serve(state_dir(args), bridge_port(args, required=False), idle_minutes=args.idle_exit)


def cmd_pull(args: argparse.Namespace) -> None:
    summary = bridge_client.pull(bridge_port(args, required=True), Path(__file__).resolve(), state_dir(args), timeout=args.timeout)
    print(describe(summary, state_dir(args)))


def cmd_import_state(args: argparse.Namespace) -> None:
    print(describe(bridge_client.import_state(args.file, state_dir(args)), state_dir(args)))


def cmd_figma_diff(args: argparse.Namespace) -> None:
    plan = PROJECT / "draft-plan.json"
    report = figma_diff.build_report(state_dir(args), args.base, not args.no_git, plan)
    print(json.dumps(report, ensure_ascii=False, indent=1) if args.json else figma_diff_render.render(report))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(required=True)

    init_cmd = commands.add_parser("init", help="Khởi tạo dự án của team tại project/ trong kit.")
    init_cmd.add_argument("--name", required=True, help="Tên plugin hiển thị trong Figma (tên dự án).")
    init_cmd.add_argument("--id", default=None, help="ID plugin (mặc định sinh từ --name).")
    init_cmd.add_argument("--frame", default="desktop", help="Cỡ khung: desktop | tablet | mobile | RỘNGxCAO (mặc định desktop).")
    init_cmd.add_argument("--target", default="improved", choices=config.TARGETS, help="Khung nhận màn dựng: improved = Cải tiến, current = Hiện tại.")
    init_cmd.set_defaults(handler=cmd_init)

    bundle = commands.add_parser("build", help="Dựng plugin cho dự án project/ ra project/dist/ (chưa init thì dựng mẫu example/).")
    bundle.add_argument("--extension", type=Path, default=None, help="Dựng thủ công từ thư mục extension này, bỏ qua project/.")
    bundle.add_argument("--plan", type=Path, default=None, help="Tệp draft-plan.json (mặc định project/draft-plan.json).")
    bundle.add_argument("--out", type=Path, default=None, help="Thư mục đầu ra (mặc định project/dist/, chưa init thì plugin/).")
    bundle.add_argument("--name", default=None, help="Ghi đè tên plugin trong design-sync.json.")
    bundle.add_argument("--id", default=None, help="Ghi đè ID plugin trong design-sync.json.")
    bundle.set_defaults(handler=cmd_build)

    check_cmd = commands.add_parser("check", help="Kiểm giới hạn kích thước mã nguồn extension và cú pháp bundle.")
    check_cmd.add_argument("--extension", type=Path, default=None, help="Thư mục extension cần kiểm (mặc định project/extension).")
    check_cmd.add_argument("--bundle", type=Path, default=None, help="Đường dẫn code.js để kiểm cú pháp bằng Node.js.")
    check_cmd.set_defaults(handler=cmd_check)

    captures = commands.add_parser("manifest", help="Tạo manifest ảnh chụp tham chiếu kèm SHA-256.")
    captures.add_argument("--root", type=Path, required=True, help="Thư mục chứa ảnh trong current/.")
    captures.add_argument("--version", required=True, help="Phiên bản app lúc chụp.")
    captures.add_argument("--commit", required=True, help="Commit app lúc chụp.")
    captures.set_defaults(handler=cmd_manifest)

    serve_cmd = commands.add_parser("serve", help="Chạy cầu nối cục bộ (127.0.0.1) nhận trạng thái Figma từ plugin vào project/figma-state/.")
    serve_cmd.add_argument("--port", type=int, default=None, help="Cổng (mặc định bridge.port trong design-sync.json, hoặc 8787).")
    serve_cmd.add_argument("--state-dir", type=Path, default=None, help="Thư mục ghi trạng thái (mặc định project/figma-state).")
    serve_cmd.add_argument("--idle-exit", type=float, default=None, help="Tự thoát sau N phút không có plugin hỏi (dùng cho server pull tự bật).")
    serve_cmd.set_defaults(handler=cmd_serve)

    pull_cmd = commands.add_parser("pull", help="Xin plugin đọc file Figma đang mở rồi chờ trạng thái về project/figma-state/ (tự bật cầu nối nếu chưa chạy).")
    pull_cmd.add_argument("--port", type=int, default=None, help="Cổng cầu nối (mặc định bridge.port).")
    pull_cmd.add_argument("--timeout", type=float, default=60, help="Số giây chờ plugin trả lời (mặc định 60).")
    pull_cmd.add_argument("--state-dir", type=Path, default=None, help="Thư mục ghi trạng thái nếu pull phải tự bật cầu nối.")
    pull_cmd.set_defaults(handler=cmd_pull)

    import_cmd = commands.add_parser("import-state", help="Nạp tệp JSON do nút Xuất trạng thái của plugin vào project/figma-state/ (không cần mạng).")
    import_cmd.add_argument("file", type=Path, help="Tệp figma-state-*.json tải về từ plugin.")
    import_cmd.add_argument("--state-dir", type=Path, default=None, help="Thư mục đích (mặc định project/figma-state).")
    import_cmd.set_defaults(handler=cmd_import_state)

    diff_cmd = commands.add_parser("figma-diff", help="So project/figma-state/ với bản chốt trước (git HEAD) và với nguồn repo; in báo cáo từng màn.")
    diff_cmd.add_argument("--json", action="store_true", help="In JSON thay vì chữ.")
    diff_cmd.add_argument("--base", type=Path, default=None, help="Thư mục figma-state làm mốc (mặc định bản ở git HEAD).")
    diff_cmd.add_argument("--no-git", action="store_true", help="Không lấy mốc từ git.")
    diff_cmd.add_argument("--state-dir", type=Path, default=None, help="Thư mục trạng thái cần so (mặc định project/figma-state).")
    diff_cmd.set_defaults(handler=cmd_figma_diff)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        args.handler(args)
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"Lỗi: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())

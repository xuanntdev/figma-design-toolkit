"""Đóng gói Design Sync Toolkit (cầu nối localhost chỉ bật khi dự án khai bridge) thành tệp ZIP."""

import argparse
import shutil
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

BASE = Path(__file__).resolve().parent
CORE_FILES = ("build.py", "config.py", "manifest.py", "settings.py", "bridge.py", "bridge_client.py", "figma_diff.py", "figma_diff_tree.py", "figma_diff_tokens.py", "figma_diff_render.py")
PLUGIN_FILES = ("VERSION", "manifest.json", "ui.html", "ui-sync.html", "ui-state.html", "ui-bridge.html")


def stage_release(core: Path, license_file: Path, destination: Path) -> str:
    kit_core = destination / "kit_core"
    plugin_source = kit_core / "plugin"
    plugin_source.mkdir(parents=True)
    root_files = ("design_sync.py", "README.md", "verify_release.py", "verify_config.py", "verify_bridge.py", ".gitignore", *(p.name for p in sorted(BASE.glob("verify_*.js"))))
    for name in root_files:
        shutil.copy(BASE / name, destination)
    shutil.copy(license_file, destination / "LICENSE.upstream.txt")
    shutil.copytree(BASE / "example", destination / "example")
    shutil.copytree(BASE / "tests", destination / "tests", ignore=shutil.ignore_patterns("__pycache__"))
    if (BASE / "capture").is_dir():
        shutil.copytree(BASE / "capture", destination / "capture", ignore=shutil.ignore_patterns("node_modules", "__pycache__"))
    if (BASE / "docs").is_dir():
        shutil.copytree(BASE / "docs", destination / "docs")
    for name in CORE_FILES:
        shutil.copy(core / name, kit_core)
    for name in PLUGIN_FILES:
        shutil.copy(core / "plugin" / name, plugin_source)
    for module_group in ("core", "entry"):
        shutil.copytree(
            core / "plugin" / module_group,
            plugin_source / module_group,
            ignore=shutil.ignore_patterns("__pycache__"),
        )

    sys.path.insert(0, str(destination))
    try:
        from design_sync import build_plugin

        plugin = build_plugin(destination / "example", destination / "plugin")
    finally:
        sys.path.pop(0)
    return plugin["version"]


def write_zip(source: Path, output: Path, name: str) -> None:
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob("*")):
            relative = path.relative_to(source)
            if path.is_file() and "__pycache__" not in relative.parts:
                entry = ZipInfo(f"{name}/{relative.as_posix()}")
                archive.writestr(entry, path.read_bytes(), compress_type=ZIP_DEFLATED)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, default=BASE / "kit_core", help="Thư mục lõi thiết kế.")
    parser.add_argument("--license-file", type=Path, default=BASE / "LICENSE.upstream.txt", help="Tệp thông báo giấy phép.")
    parser.add_argument("--out", type=Path, default=BASE / "dist")
    args = parser.parse_args()
    with TemporaryDirectory() as temporary:
        staged = Path(temporary) / "toolkit"
        version = stage_release(args.core, args.license_file, staged)
        name = f"figma-design-sync-toolkit-{version}"
        args.out.mkdir(parents=True, exist_ok=True)
        output = args.out / f"{name}.zip"
        write_zip(staged, output, name)
    print(output)


if __name__ == "__main__":
    main()

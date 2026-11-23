"""Dựng plugin Figma chạy cục bộ (không cầu nối): lõi + extension + DRAFT_PLAN + entry -> code.js."""

from __future__ import annotations

import base64
import html
import json
import re
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent / "plugin"
MAX_FILE_LINES = 300
MAX_FN_LINES = 40
DEFAULT_UI_TITLE = "Đồng bộ thiết kế"
FOOTER = "\n})();\n"
_FN_START = re.compile(r"^(?:async\s+)?function\s+(\w+)")


def natural_key(name: str) -> list:
    """Sắp xếp tự nhiên: 2-x trước 10-x."""
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", name)]


def collect(directory: Path) -> list[Path]:
    """Thu thập toàn bộ .js và .gen.json theo thứ tự tự nhiên."""
    found: list[Path] = []
    for entry in sorted(directory.iterdir(), key=lambda p: natural_key(p.name)):
        if entry.is_dir():
            found.extend(collect(entry))
        elif entry.suffix == ".js" or entry.name.endswith(".gen.json"):
            found.append(entry)
    return found


def render_png_map(spec_path: Path) -> str:
    """Chuyển {kind: png-map, const, dir, order} thành map base64 trong bundle."""
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    if spec.get("kind") != "png-map":
        raise ValueError(f"Tệp {spec_path} có loại dữ liệu chưa hỗ trợ {spec.get('kind')!r}.")
    folder = (spec_path.parent / spec["dir"]).resolve()
    rows = [f'  "{key}": "{base64.b64encode((folder / (key + ".png")).read_bytes()).decode("ascii")}"' for key in spec["order"]]
    return f"{spec.get('comment', '')}\nconst {spec['const']} = {{\n" + ",\n".join(rows) + "\n};\n"


def render_module(path: Path) -> str:
    if path.name.endswith(".gen.json"):
        return render_png_map(path)
    return path.read_text(encoding="utf-8")


def header(version: str, plan: dict | None = None, runtime: dict | None = None) -> str:
    lines = [
        "// " + "=" * 76,
        "// BUILD OUTPUT: không sửa trực tiếp. Dựng từ lõi + extension bằng `python design_sync.py build`.",
        "// " + "=" * 76,
        "(function () {",
        '"use strict";',
        f"const PLUGIN_VERSION = {json.dumps(version)};",
        f"const DESIGN_CONFIG = {json.dumps(runtime or {}, ensure_ascii=False)};",
    ]
    if plan is not None:
        lines.append(f"const DRAFT_PLAN = {json.dumps(plan, ensure_ascii=False)};")
    lines.append("")
    return "\n".join(lines)


def module_files(extensions: list[Path]) -> list[Path]:
    files = collect(PLUGIN_DIR / "core")
    for ext in extensions:
        files.extend(collect(ext))
    files.extend(collect(PLUGIN_DIR / "entry"))
    return files


def bundle_text(extensions: list[Path], version: str, plan: dict | None = None, runtime: dict | None = None) -> str:
    return header(version, plan, runtime) + "".join(render_module(p) for p in module_files(extensions)) + FOOTER


def build(
    extensions: list[Path],
    out_dir: Path,
    *,
    version: str | None = None,
    plan: dict | None = None,
    ui_path: Path | None = None,
    name: str | None = None,
    plugin_id: str | None = None,
    runtime: dict | None = None,
) -> dict:
    """Sinh code.js, ui.html và manifest.json (cục bộ 100%, allowedDomains=['none'])."""
    for ext in extensions:
        if not ext.is_dir():
            raise ValueError(f"Không tìm thấy thư mục extension {ext}.")
    version = version or (PLUGIN_DIR / "VERSION").read_text(encoding="utf-8").strip()
    out_dir.mkdir(parents=True, exist_ok=True)
    runtime = dict(runtime or {})
    if name:
        runtime["name"] = name
    text = bundle_text(extensions, version, plan=plan, runtime=runtime)
    (out_dir / "code.js").write_text(text, encoding="utf-8", newline="\n")
    ui = (ui_path or (PLUGIN_DIR / "ui.html")).read_text(encoding="utf-8")
    if name:
        ui = ui.replace(f"<h1>{DEFAULT_UI_TITLE}</h1>", f"<h1>{html.escape(name)}</h1>")
    (out_dir / "ui.html").write_text(ui, encoding="utf-8", newline="\n")
    manifest = json.loads((PLUGIN_DIR / "manifest.json").read_text(encoding="utf-8"))
    manifest["networkAccess"] = {"allowedDomains": ["none"]}
    if name:
        manifest["name"] = name
    if plugin_id:
        manifest["id"] = plugin_id
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"out": str(out_dir), "version": version, "bytes": len(text.encode("utf-8")), "modules": len(module_files(extensions))}


def long_functions(text: str) -> list[tuple[str, int]]:
    """Tìm hàm cấp ngoài dài quá MAX_FN_LINES."""
    found: list[tuple[str, int]] = []
    start, name = -1, ""
    for i, line in enumerate(text.split("\n")):
        m = _FN_START.match(line)
        if m and start < 0:
            start, name = i, m.group(1)
        if start >= 0 and line.startswith("}"):
            if i - start + 1 > MAX_FN_LINES:
                found.append((name, i - start + 1))
            start = -1
    return found


def check(paths: list[Path]) -> list[str]:
    """Kiểm giới hạn ≤ 300 dòng/file và ≤ 40 dòng/hàm trên mã nguồn JS."""
    problems: list[str] = []
    for path in paths:
        if path.suffix != ".js":
            continue
        text = path.read_text(encoding="utf-8")
        lines = text.count("\n")
        if lines > MAX_FILE_LINES:
            problems.append(f"file quá {MAX_FILE_LINES} dòng ({lines}): {path}")
        problems.extend(f"hàm {n} quá {MAX_FN_LINES} dòng ({k}): {path}" for n, k in long_functions(text))
    return problems

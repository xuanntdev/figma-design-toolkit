"""In kết quả đọc trực tiếp (tree / selection / find / lint) cho AI: dàn ý gọn có trần dòng thay vì JSON thô.
JSON đầy đủ của cây được ghi ra thư mục tạm để tra số chính xác bằng grep/jq khi cần; `--json` in thẳng JSON thô.
"""

from __future__ import annotations

import hashlib
import json
import re
import tempfile
from pathlib import Path

from kit_core import figma_spec


def cache_dir(state_dir: Path) -> Path:
    key = hashlib.sha1(str(Path(state_dir).resolve()).encode("utf-8")).hexdigest()[:10]
    return Path(tempfile.gettempdir()) / "design-sync" / key


def save_tree(folder: Path, node_id: str, tree: dict) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (re.sub(r"[^A-Za-z0-9_-]+", "-", str(node_id)) + ".json")
    path.write_text(json.dumps(tree, ensure_ascii=False), encoding="utf-8")
    return path


def head(response: dict, info: dict) -> list[str]:
    return [f'# Figma "{response.get("file")}" · phiên {response.get("session")} · đọc trực tiếp lúc {info.get("readAt", "")}']


def node_block(item: dict, lines: int, folder: Path) -> list[str]:
    tree = item["tree"]
    path = save_tree(folder, item.get("nodeId") or tree.get("id"), tree)
    out = [f'# node #{tree.get("id")} "{tree.get("n")}" · màn "{item.get("screen")}" #{item.get("frameId")} · page "{item.get("page")}"',
           f"# JSON của lần đọc này: {path}"]
    body, folded = figma_spec.outline(tree, lines)
    out += body
    if folded:
        out.append(f"# đã thu gọn {folded} node (trần {lines} dòng) — đọc tiếp nhánh cần bằng tree <id>, hoặc --lines lớn hơn")
    return out


def render_find(response: dict, info: dict) -> list[str]:
    out = head(response, info) + [f'# {info.get("total", 0)} kết quả, in {info.get("shown", 0)}']
    for hit in info.get("hits") or []:
        parts = [f'#{hit["id"]} {hit["t"]} {json.dumps(hit.get("n", ""), ensure_ascii=False)} {figma_spec.num(hit.get("w", 0))}×{figma_spec.num(hit.get("h", 0))}']
        parts.append(f'{hit.get("page")} › {hit.get("path")}' if hit.get("path") else str(hit.get("page")))
        if hit.get("text") is not None:
            parts.append(json.dumps(hit["text"], ensure_ascii=False))
        if hit.get("component"):
            parts.append(f'→ {hit["component"]}')
        if hit.get("kids"):
            parts.append(f'{hit["kids"]} con')
        out.append(" · ".join(parts))
    if info.get("total", 0) > info.get("shown", 0):
        out.append("# còn kết quả: thu hẹp bằng --type / --within / --page-id hoặc tăng --limit")
    return out


def render_lint(response: dict, info: dict) -> list[str]:
    scope = info.get("scope") or {}
    counts = ", ".join(f"{k} {v}" for k, v in (info.get("counts") or {}).items())
    out = head(response, info) + [f'# phạm vi {scope.get("t")} "{scope.get("name")}" #{scope.get("id")} · {counts}']
    if info.get("colors"):
        out.append("# màu thô hay gặp: " + ", ".join(f'{c["hex"]}×{c["n"]}' for c in info["colors"]))
    for issue in info.get("issues") or []:
        out.append(f'{issue["rule"]} · #{issue["id"]} {issue["t"]} {json.dumps(issue.get("n", ""), ensure_ascii=False)} · {issue.get("value")} · {issue.get("path")}')
    total = sum((info.get("counts") or {}).values())
    if total > info.get("shown", 0):
        out.append(f"# in {info.get('shown', 0)}/{total} — lọc bằng --rule, --within hoặc tăng --limit")
    return out


def render(command: str, response: dict, lines: int, folder: Path) -> str:
    info = response.get("result") or {}
    if command == "find":
        return "\n".join(render_find(response, info))
    if command == "lint":
        return "\n".join(render_lint(response, info))
    out = head(response, info) + [f"# {figma_spec.LEGEND}"]
    if command == "tree":
        return "\n".join(out + node_block(info["node"], lines, folder))
    items = info.get("selection") or []
    if not items:
        return "\n".join(out + ["# selection trống — chọn layer trong Figma hoặc dùng find"])
    for item in items:
        out += node_block(item, max(20, lines // len(items)), folder)
    return "\n".join(out)

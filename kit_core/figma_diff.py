"""`design_sync.py figma-diff`: so trạng thái Figma đã kéo về (project/figma-state/) với bản chốt trước và với nguồn của repo.

Bản chốt trước = figma-state đã commit ở HEAD (hoặc --base <thư mục>). Nguồn repo = draft-plan.json (danh sách màn) và bảng token
extension khai báo (plugin chép vào tokens.json mục `repo`). Chỉ đọc, không ghi gì.
"""

from __future__ import annotations

import io
import json
import subprocess
import tarfile
from pathlib import Path

from kit_core import figma_diff_tree as tree
from kit_core import figma_diff_tokens as tok


def read_dir(root: Path) -> dict:
    """{index, tokens, components, screens: {khoá: JSON}} từ một thư mục figma-state."""
    def load(name):
        path = root / name
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
    screens = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((root / "screens").glob("*.json"))} if (root / "screens").is_dir() else {}
    state = {"index": load("index.json"), "tokens": load("tokens.json"), "components": load("components.json"), "screens": screens}
    if state["index"] is None:
        raise ValueError(f"Chưa có trạng thái Figma tại {root}. Chạy `python design_sync.py pull` (hoặc import-state).")
    return state


def read_git_base(state_dir: Path) -> dict | None:
    """figma-state ở HEAD của git (bản đã chốt); None khi không phải repo git hoặc chưa commit."""
    try:
        top = subprocess.run(["git", "-C", str(state_dir.parent), "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip()
        rel = state_dir.resolve().relative_to(Path(top).resolve()).as_posix()
        raw = subprocess.run(["git", "-C", top, "archive", "--format=tar", "HEAD", "--", rel], capture_output=True, check=True).stdout
    except (OSError, ValueError, subprocess.CalledProcessError):
        return None
    files = {}
    with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
        for member in tar.getmembers():
            if member.isfile() and member.name.endswith(".json"):
                files[member.name[len(rel) + 1:]] = json.loads(tar.extractfile(member).read().decode("utf-8"))
    if "index.json" not in files:
        return None
    return {"index": files["index.json"], "tokens": files.get("tokens.json"), "components": files.get("components.json"),
            "screens": {k[len("screens/"):-len(".json")]: v for k, v in files.items() if k.startswith("screens/")}}


def plan_ids(plan_path: Path | None) -> list[str] | None:
    if plan_path and plan_path.is_file():
        return list(json.loads(plan_path.read_text(encoding="utf-8")).get("screenIds") or [])
    return None


def screen_entry(row: dict, cur: dict, base: dict | None) -> dict | None:
    """Mô tả thay đổi của một màn; None khi không có gì đáng báo."""
    out = {"key": row["key"], "screenId": row.get("screenId"), "name": row.get("name"), "section": row.get("section"), "status": row["status"]}
    if row.get("textDiff"):
        out["textVsRepo"] = row["textDiff"]
    old = (base or {}).get("screens", {}).get(row["key"])
    if old is not None and row["key"] in cur["screens"]:
        diff = tree.diff_trees(old["tree"], cur["screens"][row["key"]]["tree"])
        if not tree.is_empty(diff):
            out["vsBase"] = diff
    elif base is not None and row["status"] != "untouched":
        out["vsBase"] = "new"
    keep = row["status"] in ("edited", "unknown") or "vsBase" in out
    return out if keep else None


def screens_report(cur: dict, base: dict | None, plan: list[str] | None) -> dict:
    rows = cur["index"].get("screens") or []
    plugin_rows = [r for r in rows if r["status"] != "handmade"]
    in_figma = {r.get("screenId") for r in plugin_rows if r.get("screenId")}
    changed = [e for e in (screen_entry(r, cur, base) for r in rows if r.get("screenId") and r["status"] != "handmade") if e]
    handmade = [{k: r.get(k) for k in ("key", "name", "section", "page", "w", "h")} for r in rows if r["status"] == "handmade"]
    return {
        "changed": changed,
        "handmade": handmade,
        "missingInFigma": sorted(set(plan) - in_figma) if plan is not None else None,
        "notInPlan": sorted(in_figma - set(plan)) if plan is not None else None,
        "repoNewer": sorted({r["screenId"] for r in plugin_rows if r.get("repoChanged")}),
    }


def build_report(state_dir: Path, base_dir: Path | None, use_git: bool, plan_path: Path | None) -> dict:
    cur = read_dir(state_dir)
    base = read_dir(base_dir) if base_dir else (read_git_base(state_dir) if use_git else None)
    base_label = str(base_dir) if base_dir else ("git HEAD" if base else None)
    return {
        "readAt": cur["index"].get("readAt"), "file": cur["index"].get("file"), "counts": cur["index"].get("counts"), "base": base_label,
        "screens": screens_report(cur, base, plan_ids(plan_path)),
        "tokens": {"vsRepo": tok.tokens_vs_repo(cur["tokens"]), "vsBase": tok.tokens_vs_base(base and base["tokens"], cur["tokens"])},
        "components": tok.components_vs_base(base and base["components"], cur["components"]),
    }

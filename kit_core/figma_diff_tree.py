"""So sánh hai cây node của một màn (định dạng compact do plugin readState xuất): chữ, instance, màu/token, thêm/bớt node."""

from __future__ import annotations

from collections import Counter

LOOK = ("fills", "strokes", "r", "rv", "sw", "style", "font", "size", "lm", "gap", "pad", "vars", "hidden")
INSTANCE = ("main", "set", "variant", "props")


def flatten(node: dict, path: str = "", out: dict | None = None) -> dict:
    """Phẳng hoá cây thành {đường dẫn: node}; đường dẫn = tên node (trùng tên thì thêm [i]); instance lồng nhau nằm dưới 'cha>tên'."""
    out = {} if out is None else out
    seen: Counter = Counter()
    kids = [(c, "/") for c in node.get("c") or []] + [(dict(n, t="INSTANCE"), ">") for n in node.get("nested") or []]
    for child, sep in kids:
        name = child.get("n", "?")
        idx = seen[(sep, name)]
        seen[(sep, name)] += 1
        child_path = f"{path}{sep}{name}" + (f"[{idx}]" if idx else "")
        out[child_path] = child
        flatten(child, child_path, out)
    return out


def texts_of(node: dict, acc: list | None = None) -> list:
    acc = [] if acc is None else acc
    if node.get("chars") is not None:
        acc.append(node["chars"])
    acc.extend(node.get("texts") or [])
    for child in node.get("c") or []:
        texts_of(child, acc)
    return acc


def text_changes(old: dict, new: dict) -> dict:
    before, after = Counter(texts_of(old)), Counter(texts_of(new))
    return {"added": sorted((after - before).elements()), "removed": sorted((before - after).elements())}


def node_changes(path: str, a: dict, b: dict) -> list[dict]:
    out = []
    for field in INSTANCE + LOOK:
        same_set_variant = field == "main" and a.get("set") == b.get("set") and a.get("variant") != b.get("variant")
        if a.get(field) != b.get(field) and not same_set_variant:  # đổi biến thể trong cùng set chỉ báo là variant, không báo "đổi component"
            kind = {"main": "swap", "set": "swap", "variant": "variant", "props": "prop"}.get(field, "look")
            out.append({"path": path, "kind": kind, "field": field, "from": a.get(field), "to": b.get(field)})
    if a.get("chars") != b.get("chars"):
        out.append({"path": path, "kind": "text", "field": "chars", "from": a.get("chars"), "to": b.get("chars")})
    return out


def top_level(paths: list[str]) -> list[str]:
    """Chỉ giữ node gốc của nhánh được thêm/bớt (bỏ con của nhánh đó)."""
    chosen = set(paths)
    return [p for p in paths if not any(p != q and p.startswith(q) and p[len(q)] in "/>" for q in chosen)]


def diff_trees(old: dict, new: dict) -> dict:
    a, b = flatten(old), flatten(new)
    changes: list[dict] = []
    moved = 0
    for path in a.keys() & b.keys():
        changes.extend(node_changes(path, a[path], b[path]))
        if any(a[path].get(k) != b[path].get(k) for k in ("x", "y", "w", "h")):
            moved += 1
    name_of = lambda tree, p: {"path": p, "type": tree[p].get("t"), "text": tree[p].get("chars")}  # noqa: E731
    return {
        "texts": text_changes(old, new),
        "added": [name_of(b, p) for p in top_level([p for p in b if p not in a])],
        "removed": [name_of(a, p) for p in top_level([p for p in a if p not in b])],
        "changes": sorted(changes, key=lambda c: (c["path"], c["field"])),
        "geometry": moved,
    }


def is_empty(diff: dict) -> bool:
    return not (diff["texts"]["added"] or diff["texts"]["removed"] or diff["added"] or diff["removed"] or diff["changes"] or diff["geometry"])

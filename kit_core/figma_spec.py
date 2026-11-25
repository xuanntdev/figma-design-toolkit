"""Cây node Figma (định dạng readState/tree) -> dàn ý gọn cho AI: mỗi node một dòng, thụt lề theo cấp, viết bằng từ vựng flex/token.
Có trần số dòng: cây lớn thì thu gọn các cấp sâu, kèm id để đọc tiếp bằng `tree <id>`.
"""

from __future__ import annotations

import json

LEGEND = ('Mỗi dòng 1 node: loại "tên" #id · rộng×cao (fill|hug|px) · flex row|col gap pad(t r b l) justify align · '
          'bg/border/radius/shadow · $token (giá trị) · "chữ" font cỡ/dòng màu. "+N node ▸ #id" = nhánh thu gọn, đọc tiếp bằng tree <id>.')
KIND = {"FRAME": "box", "INSTANCE": "use", "TEXT": "text", "RECTANGLE": "rect", "VECTOR": "icon", "BOOLEAN_OPERATION": "icon",
        "ELLIPSE": "ellipse", "GROUP": "group", "COMPONENT": "component", "COMPONENT_SET": "component-set", "LINE": "line", "SECTION": "section"}
JUSTIFY = {"MIN": "start", "CENTER": "center", "MAX": "end", "SPACE_BETWEEN": "between"}
ALIGN = {"MIN": "start", "CENTER": "center", "MAX": "end", "BASELINE": "baseline"}
LEAF = {"INSTANCE", "VECTOR", "BOOLEAN_OPERATION"}
TEXTS_CAP = 8


def num(v) -> str:
    if not isinstance(v, (int, float)):
        return str(v)
    v = round(v, 2)
    return str(int(v)) if v == int(v) else str(v)


def color(p) -> str | None:
    if not isinstance(p, dict):
        return None
    if p.get("c"):
        val = p["c"] + (f"@{num(p['a'])}" if p.get("a") is not None and p["a"] < 1 else "")
    else:
        val = str(p.get("type", "")).replace("GRADIENT_", "gradient-").lower()
    return f"${p['var']} ({val})" if p.get("var") else val


def paints(items, style: str | None = None) -> str | None:
    out = [c for c in (color(p) for p in items) if c] if isinstance(items, list) else []
    if not out:
        return None
    return f"${style} ({' + '.join(out)})" if style else " + ".join(out)


def size(n: dict, axis: str) -> str:
    mode = n.get("layoutSizingHorizontal" if axis == "w" else "layoutSizingVertical")
    return {"FILL": "fill", "HUG": "hug"}.get(mode) or num(n.get(axis, 0))


def pad(p) -> str | None:
    if not p:
        return None
    t, r, b, l = p
    if t == r == b == l:
        return f"pad {num(t)}"
    return f"pad {num(t)} {num(r)}" if t == b and r == l else "pad " + " ".join(num(v) for v in p)


def layout(n: dict) -> list[str]:
    if n.get("lm") not in ("H", "V"):
        return []
    parts = ["flex " + ("row" if n["lm"] == "H" else "col")]
    justify, align = JUSTIFY.get(n.get("primaryAxisAlignItems", "MIN")), ALIGN.get(n.get("counterAxisAlignItems", "MIN"))
    if n.get("gap") and justify != "between":
        parts.append(f"gap {num(n['gap'])}")
    if justify != "start":
        parts.append(f"justify {justify}")
    if align != "start":
        parts.append(f"align {align}")
    if n.get("layoutWrap") == "WRAP":
        parts.append(f"wrap gap {num(n.get('counterAxisSpacing') or 0)}")
    return parts + [x for x in [pad(n.get("pad"))] if x]


def border(n: dict) -> str | None:
    c = paints(n.get("strokes"), (n.get("styles") or {}).get("stroke"))
    if not c:
        return None
    sw = n.get("sw", 1)
    width = "[" + " ".join(num(v) for v in sw) + "]" if isinstance(sw, list) else num(sw)
    align = n.get("strokeAlign")
    return f"border {width} {c}" + (" dashed" if n.get("dash") else "") + (f" {align.lower()}" if align else "")


def effects(n: dict) -> list[str]:
    style = (n.get("styles") or {}).get("effect")
    if style:
        return [f"shadow ${style}"]
    out = []
    for e in n.get("effects") or []:
        kind = str(e.get("type", ""))
        if kind.endswith("SHADOW"):
            x, y = (e.get("offset") or [0, 0])[:2]
            name = "inset-shadow" if kind == "INNER_SHADOW" else "shadow"
            out.append(f"{name} {num(x)} {num(y)} {num(e.get('radius', 0))} {num(e.get('spread', 0))} {e.get('color')}")
        else:
            out.append(f"{kind.lower().replace('_', '-')} {num(e.get('radius', 0))}")
    return out


def text_parts(n: dict) -> list[str]:
    font = f"${n['style']}" if n.get("style") else f"{n.get('font')} {num(n.get('size'))}" + (f"/{n['lh']}" if n.get("lh") is not None else "")
    parts = [json.dumps(n.get("chars", ""), ensure_ascii=False), font, paints(n.get("fills"), (n.get("styles") or {}).get("fill"))]
    if n.get("ls"):
        parts.append(f"tracking {n['ls']}")
    if n.get("textAlignHorizontal"):
        parts.append("text-" + n["textAlignHorizontal"].lower())
    for key in ("textCase", "textDecoration"):
        if n.get(key):
            parts.append(n[key].lower())
    if n.get("textTruncation") == "ENDING":
        parts.append("ellipsis" + (f" {n['maxLines']} dòng" if n.get("maxLines") else ""))
    return [p for p in parts if p]


def instance_parts(n: dict) -> list[str]:
    variant = n.get("variant") or {}
    parts = [f"→ {n.get('set') or n.get('main') or '?'}" + (" {" + ", ".join(f"{k}={v}" for k, v in variant.items()) + "}" if variant else "")]
    if n.get("props"):
        parts.append("props " + json.dumps(n["props"], ensure_ascii=False))
    texts = n.get("texts") or []
    if texts:
        parts.append("texts " + json.dumps(texts[:TEXTS_CAP], ensure_ascii=False) + (f" +{len(texts) - TEXTS_CAP}" if len(texts) > TEXTS_CAP else ""))
    if n.get("overridden"):
        parts.append("override " + ",".join(n["overridden"]))
    return parts


def look(n: dict) -> list[str]:
    parts = [x for x in [border(n)] if x]
    if n.get("radii"):
        parts.append("radius [" + " ".join(num(v) for v in n["radii"]) + "]")
    elif n.get("r"):
        parts.append(f"radius {num(n['r'])}")
    parts += effects(n)
    for key, label in (("opacity", "opacity"), ("rotation", "rotate")):
        if n.get(key) is not None:
            parts.append(f"{label} {num(n[key])}")
    if n.get("clipsContent") and n.get("c"):
        parts.append("clip")
    if n.get("hidden"):
        parts.append("ẨN")
    if n.get("truncated"):
        parts.append(f"(bản đọc cắt bớt {n['truncated']} con)")
    return parts


def line(n: dict, parent: dict | None) -> str:
    parts = [f'{KIND.get(n.get("t"), str(n.get("t", "")).lower())} {json.dumps(n.get("n", ""), ensure_ascii=False)} #{n.get("id")}']
    if n.get("t") == "INSTANCE":
        parts += instance_parts(n)
    parts.append(f"{size(n, 'w')}×{size(n, 'h')}")
    in_flex = parent is not None and parent.get("lm") in ("H", "V")
    if parent is not None and (not in_flex or n.get("layoutPositioning") == "ABSOLUTE"):
        parts.append(f"at {num(n.get('x', 0))},{num(n.get('y', 0))}")
    if n.get("t") == "TEXT":
        parts += text_parts(n)
    else:
        parts += layout(n)
        bg = paints(n.get("fills"), (n.get("styles") or {}).get("fill"))
        if bg:
            parts.append(("color " if n.get("t") in ("VECTOR", "BOOLEAN_OPERATION") else "bg ") + bg)
    return " · ".join(parts + look(n))


def kids(n: dict) -> list[dict]:
    return [] if n.get("t") in LEAF else n.get("c") or []


def count(n: dict) -> int:
    return 1 + sum(count(c) for c in kids(n))


def pick_depth(root: dict, max_lines: int) -> int:
    """Độ sâu lớn nhất mà số dòng (node có cấp <= độ sâu) không vượt trần."""
    level, depth, used = [root], 0, 1
    while True:
        nxt = [c for n in level for c in kids(n)]
        if not nxt or used + len(nxt) > max_lines:
            return depth
        used += len(nxt)
        level, depth = nxt, depth + 1


def outline(root: dict, max_lines: int = 300) -> tuple[list[str], int]:
    """(dòng, số node bị thu gọn). Cấp sâu nhất vừa trần được in; nhánh dưới đó ghi '+N node ▸ #id'."""
    limit = pick_depth(root, max_lines)
    out: list[str] = []
    folded = 0

    def walk(n: dict, depth: int, parent: dict | None) -> None:
        nonlocal folded
        text = line(n, parent)
        children = kids(n)
        if children and depth >= limit:
            hidden = count(n) - 1
            folded += hidden
            text += f" · +{hidden} node ▸ #{n.get('id')}"
        out.append("  " * depth + text)
        if depth < limit:
            for c in children:
                walk(c, depth + 1, n)

    walk(root, 0, None)
    return out, folded

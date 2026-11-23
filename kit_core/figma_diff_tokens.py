"""So token (biến, text style) và component trên Figma với bảng token của repo (tokens.json mục `repo`) và với bản chốt trước."""

from __future__ import annotations


def index_vars(tokens: dict | None) -> dict:
    """{'Collection/tên biến': biến} từ tokens.json."""
    out = {}
    for col in (tokens or {}).get("collections") or []:
        for var in col.get("variables") or []:
            out[f"{col['name']}/{var['name']}"] = var
    return out


def by_name(tokens: dict | None) -> dict:
    out: dict = {}
    for key, var in index_vars(tokens).items():
        out.setdefault(var["name"], []).append(var)
    return out


def norm(value):
    return int(value) if isinstance(value, float) and value.is_integer() else value


def check_color_tables(repo: dict, names: dict) -> list[dict]:
    """Bảng hex -> tên biến (fill/stroke/text) và số -> tên biến (radius): biến thiếu hoặc khác giá trị so với repo."""
    out, seen = [], set()
    for role in ("fill", "stroke", "text", "radius"):
        for expected, name in (repo.get(role) or {}).items():
            if (name, str(expected)) in seen:
                continue
            seen.add((name, str(expected)))
            found = names.get(name)
            if not found:
                out.append({"kind": "missing", "name": name, "repo": expected})
            elif not any(str(norm(v.get("resolved"))) == str(norm(expected)) for v in found):
                out.append({"kind": "changed", "name": name, "repo": expected, "figma": found[0].get("resolved")})
    return out


def check_text_styles(repo: dict, tokens: dict) -> list[dict]:
    have = {s["name"]: s for s in tokens.get("textStyles") or []}
    out = []
    for want in repo.get("textStyles") or []:
        style = have.get(want["name"])
        if not style:
            out.append({"kind": "missing", "name": want["name"], "repo": f"{want['family']} {want['style']} {want['size']}/{want['lineHeight']}"})
            continue
        figma = {"font": style.get("font"), "size": style.get("size"), "lineHeight": style.get("lineHeight")}
        expect = {"font": f"{want['family']} {want['style']}", "size": want["size"], "lineHeight": want["lineHeight"]}
        if figma != expect:
            out.append({"kind": "changed", "name": want["name"], "repo": expect, "figma": figma})
    return out


def tokens_vs_repo(tokens: dict | None) -> dict | None:
    repo = (tokens or {}).get("repo")
    if not repo:
        return None
    return {"variables": check_color_tables(repo, by_name(tokens)), "textStyles": check_text_styles(repo, tokens)}


def keyed_diff(old: dict, new: dict, fields: tuple) -> dict:
    changed = []
    for key in sorted(old.keys() & new.keys()):
        delta = {f: [old[key].get(f), new[key].get(f)] for f in fields if old[key].get(f) != new[key].get(f)}
        if delta:
            changed.append({"name": key, "fields": delta})
    return {"added": sorted(new.keys() - old.keys()), "removed": sorted(old.keys() - new.keys()), "changed": changed}


def tokens_vs_base(old: dict | None, new: dict | None) -> dict | None:
    if old is None or new is None:
        return None
    variables = keyed_diff(index_vars(old), index_vars(new), ("type", "values", "resolved", "scopes", "codeSyntax"))
    styles = keyed_diff({s["name"]: s for s in old.get("textStyles") or []}, {s["name"]: s for s in new.get("textStyles") or []}, ("font", "size", "lineHeight", "vars"))
    return {"variables": variables, "textStyles": styles}


def components_vs_base(old: dict | None, new: dict | None) -> dict | None:
    if old is None or new is None:
        return None
    a, b = {s["name"]: s for s in old.get("sets") or []}, {s["name"]: s for s in new.get("sets") or []}
    out = keyed_diff(a, b, ("description", "props"))
    for name in sorted(a.keys() & b.keys()):
        before, after = set(a[name].get("variants") or []), set(b[name].get("variants") or [])
        if before == after:
            continue
        item = next((c for c in out["changed"] if c["name"] == name), None)
        if item is None:
            item = {"name": name, "fields": {}}
            out["changed"].append(item)
        item["fields"]["variants"] = {"added": sorted(after - before), "removed": sorted(before - after)}
    return out

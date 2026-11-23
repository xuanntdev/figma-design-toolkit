"""In báo cáo figma-diff dạng chữ gọn (tiếng Việt) cho người và AI đọc."""

from __future__ import annotations

CAP = 8


def short(value, limit: int = 60) -> str:
    text = value if isinstance(value, str) else repr(value)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def listing(items: list, label: str, indent: str = "    ") -> list[str]:
    shown = [f"{indent}{label} {short(i)}" for i in items[:CAP]]
    return shown + ([f"{indent}… và {len(items) - CAP} mục nữa"] if len(items) > CAP else [])


def render_diff(diff: dict) -> list[str]:
    lines = listing(diff["texts"]["added"], "+ chữ:") + listing(diff["texts"]["removed"], "- chữ:")
    for kind, label in (("swap", "đổi component"), ("variant", "đổi variant"), ("prop", "đổi property"), ("look", "đổi màu/token/kiểu")):
        rows = [c for c in diff["changes"] if c["kind"] == kind]
        lines += listing([f"{c['path']} · {c['field']}: {short(c['from'])} -> {short(c['to'])}" for c in rows], f"~ {label}:")
    lines += listing([f"{n['path']} ({n['type']})" for n in diff["added"]], "+ node:")
    lines += listing([f"{n['path']} ({n['type']})" for n in diff["removed"]], "- node:")
    if diff["geometry"]:
        lines.append(f"    ~ {diff['geometry']} node đổi vị trí/kích thước")
    return lines


def render_screen(entry: dict) -> list[str]:
    head = f"  [{entry['status']}] {entry['screenId']} · {entry.get('name')}" + (f" · {entry['section']}" if entry.get("section") else "")
    lines = [head]
    vs_base = entry.get("vsBase")
    if vs_base == "new":
        lines.append("    (chưa có trong bản chốt trước để so từng node)")
    elif vs_base:
        lines += render_diff(vs_base)
    elif entry.get("textVsRepo"):
        lines.append("    (so với nguồn repo, chưa có bản chốt trước)")
        lines += listing(entry["textVsRepo"].get("added") or [], "+ chữ:") + listing(entry["textVsRepo"].get("removed") or [], "- chữ:")
    return lines


def render_tokens(tokens: dict) -> list[str]:
    lines = []
    repo = tokens["vsRepo"]
    if repo is None:
        lines.append("  (extension không khai bảng token linkTokens nên không so được với repo)")
    else:
        rows = [f"{r['kind']} {r['name']}: repo {short(r['repo'])}" + (f" / Figma {short(r['figma'])}" if "figma" in r else "") for r in repo["variables"] + repo["textStyles"]]
        lines += listing(rows, "!", "  ") if rows else ["  Token khớp bảng repo."]
    base = tokens["vsBase"]
    if base:
        for group, label in (("variables", "biến"), ("textStyles", "text style")):
            part = base[group]
            lines += listing(part["added"], f"+ {label}:", "  ") + listing(part["removed"], f"- {label}:", "  ")
            lines += listing([f"{c['name']} ({', '.join(c['fields'])})" for c in part["changed"]], f"~ {label}:", "  ")
    return lines


def render_components(comp: dict | None) -> list[str]:
    if comp is None:
        return ["  (chưa có bản chốt trước)"]
    lines = listing(comp["added"], "+ set:", "  ") + listing(comp["removed"], "- set:", "  ")
    lines += listing([f"{c['name']} ({', '.join(c['fields'])})" for c in comp["changed"]], "~ set:", "  ")
    return lines or ["  Không đổi."]


def render(report: dict) -> str:
    counts = report.get("counts") or {}
    scr = report["screens"]
    out = [f"Figma: {report.get('file')} · đọc lúc {report.get('readAt')} · bản chốt trước: {report['base'] or 'không có (commit figma-state để làm mốc)'}",
           f"Màn: {counts.get('screens', 0)} · sửa tay {counts.get('edited', 0)} · vẽ tay {counts.get('handmade', 0)} · chưa rõ {counts.get('unknown', 0)}", "", "MÀN ĐÃ ĐỔI"]
    for entry in scr["changed"]:
        out += render_screen(entry)
    out += ["  Không có màn nào đổi."] if not scr["changed"] else []
    out += ["", f"KHUNG VẼ TAY (không có trong repo): {len(scr['handmade'])}"]
    out += [f"  {h['name']} · {h.get('section') or h.get('page')} · {h.get('w')}x{h.get('h')}" for h in scr["handmade"][:CAP * 3]]
    if scr["missingInFigma"]:
        out += ["", f"Có trong plan, chưa có trên Figma: {len(scr['missingInFigma'])}"] + listing(scr["missingInFigma"], "-", "  ")
    if scr["notInPlan"]:
        out += ["", f"Có trên Figma, không còn trong plan: {len(scr['notInPlan'])}"] + listing(scr["notInPlan"], "-", "  ")
    if scr["repoNewer"]:
        out += ["", f"Nguồn repo mới hơn bản dựng (cần Cập nhật): {len(scr['repoNewer'])} màn"]
    out += ["", "TOKEN"] + render_tokens(report["tokens"]) + ["", "COMPONENT"] + render_components(report["components"])
    return "\n".join(out)

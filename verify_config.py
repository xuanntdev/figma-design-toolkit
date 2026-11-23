"""Kiểm thử các tuỳ chọn trong design-sync.json: hai kịch bản dùng kit (A sửa trực tiếp, B sinh màn mới), kết hợp hai khu, từng tuỳ chọn."""

import subprocess
from pathlib import Path

SCENARIO_A = {"target": "current", "improved": False, "layout": "sections", "sync": "merge", "collapseSingleFlow": False}
FRAME = {"width": 100, "height": 100, "perRow": 3}
FLOWS = {"g1": [("f1", "LUỒNG MỘT", ["g1-a", "g1-b", "g1-c"]), ("f2", "LUỒNG HAI", ["g1-d", "g1-e"])], "g2": [("x1", "LUỒNG X", ["g2-a", "g2-b"])]}
SEVEN = ["g1-a", "g1-b", "g1-c", "g1-d", "g1-e", "g2-a", "g2-b"]


def tree_plan(areas: dict, flows: dict) -> dict:
    """Plan có groupOrders (area) + screenFlows như capture/gen-plan.mjs sinh: flows = {nhóm: [(id, title, [stem...])]}."""
    titles = {"g1": "Nhóm 1", "g2": "Nhóm 2", "g3": "Nhóm 3"}
    orders = {g: {"order": int(g[1]), "title": t, "area": areas[g]} for g, t in titles.items()}
    screen_flows = {s: {"id": fid, "title": ft, "order": i} for fl in flows.values() for i, (fid, ft, stems) in enumerate(fl, 1) for s in stems}
    return {"screenIds": ["g1-a"], "themes": ["light"], "replace": True, "groupOrders": orders, "screenFlows": screen_flows}


def seven_plan() -> dict:
    """Plan 7 màn của nhóm 1-2: nhóm 1 có 2 luồng, nhóm 2 một luồng, nhóm 3 ngoài lô."""
    return {**tree_plan({"g1": "KHU A", "g2": "KHU A", "g3": "KHU B"}, FLOWS), "screenIds": SEVEN}


def verify_scenarios(kit: Path, work: Path) -> None:
    # 4g. Hai kịch bản A (sửa trực tiếp) / B (sinh màn mới) và kết hợp hai khu, mỗi kịch bản một bộ cấu hình
    from kit_core import build, config

    ext = kit / "tests" / "layout-extension"
    frame, plan = FRAME, seven_plan()
    configs = {
        "A": {**SCENARIO_A, "collapseSingleFlow": True, "screenLabels": "name", "preview": True},
        "B": {"target": "improved", "improved": True, "layout": "grid", "sync": "replace"},
        "AB": {"target": "current", "improved": True, "layout": "sections", "sync": "merge"},
        "GB": {"target": "current", "improved": True, "layout": "grid", "sync": "replace"},
    }
    for name, options in configs.items():
        build.build([ext], work / "scenarios" / name, runtime=config.runtime({"frame": frame, **options}), plan=plan)
    subprocess.run(["node", str(kit / "verify_scenarios.js"), str(work / "scenarios")], check=True)


BAD_OPTIONS = (
    {"layout": "tree"}, {"sync": "git"}, {"tokens": "auto"}, {"screenLabels": "text"}, {"preview": "yes"}, {"cleanup": 1}, {"sortGroups": "a"},
    {"collapseSingleFlow": None}, {"sectionLevels": []}, {"sectionLevels": ["flow", "group"]}, {"sectionLevels": ["group", "group"]},
    {"sectionLevels": ["team"]}, {"sectionLevels": "group"}, {"sectionFills": {"team": "#FFFFFF"}}, {"sectionFills": {"group": "blue"}}, {"sectionFills": []},
)


def verify_defaults(config) -> None:
    default = config.runtime({})
    assert (default["layout"], default["sync"], default["screenLabels"], default["preview"], default["cleanup"], default["sortGroups"]) == ("grid", "replace", False, False, False, False), default
    assert default["tokens"] == "button" and default["collapseSingleFlow"] is True and default["sectionLevels"] == ["area", "group", "flow"]
    assert default["sectionFills"] == {"area": None, "group": "#DCEAFB", "flow": "#EEF5FE"}
    assert config.runtime({"sectionFills": {"group": None}})["sectionFills"] == {"area": None, "group": None, "flow": "#EEF5FE"}
    for options in ({"screenLabels": "name"}, {"screenLabels": True}, {"sectionLevels": ["group"]}, {"sectionFills": {"flow": None}}, {"layout": "sections", "sync": "merge"}):
        config.validate(dict(options), Path("design-sync.json"))
    for bad in BAD_OPTIONS:
        try:
            config.validate(dict(bad), Path("design-sync.json"))
        except ValueError:
            continue
        raise AssertionError(f"Cấu hình sai phải bị từ chối: {bad}")


def verify_options(kit: Path, work: Path) -> None:
    # 4h. Tuỳ chọn: mặc định = kit gốc, kiểm hợp lệ, từng cấp Section / màu / gộp luồng / sắp nhóm
    from kit_core import build, config

    verify_defaults(config)
    ext = kit / "tests" / "layout-extension"
    base = {"target": "current", "improved": False, "layout": "sections", "sync": "merge"}
    variants = {
        "default": {},
        "group-flow": {"sectionLevels": ["group", "flow"], "collapseSingleFlow": False},
        "group-flow-collapse": {"sectionLevels": ["group", "flow"]},
        "group": {"sectionLevels": ["group"]},
        "area-flow": {"sectionLevels": ["area", "flow"]},
        "fills": {"sectionFills": {"area": "#EEEEEE", "group": None, "flow": "#FFFFFF"}},
    }
    for name, options in variants.items():
        build.build([ext], work / "options" / name, runtime=config.runtime({"frame": FRAME, **base, **options}), plan=seven_plan())
    build_sorting(kit, work)
    subprocess.run(["node", str(kit / "verify_options.js"), str(work / "options")], check=True)


def build_sorting(kit: Path, work: Path) -> None:
    """Nhóm khai báo order 3, 1, 2 (đảo so với extension thử) dựng ở lưới Cải tiến, sortGroups tắt/bật."""
    from kit_core import build, config

    ext = kit / "tests" / "layout-extension"
    reordered = work / "options-ext"
    reordered.mkdir()
    text = (ext / "01-ext.js").read_text(encoding="utf-8")
    assert text.count("order: 1,") == 1 and text.count("order: 2,") == 1 and text.count("order: 3,") == 1
    swapped = text.replace("order: 1,", "order: 3,", 1).replace("order: 2,", "order: 1,", 1).replace("order: 3, screens: [['a', 100], ['b', 100]", "order: 2, screens: [['a', 100], ['b', 100]", 1)
    (reordered / "01-ext.js").write_text(swapped, encoding="utf-8")
    for name, sort in (("sort-off", False), ("sort-on", True)):
        runtime = config.runtime({"frame": FRAME, "target": "improved", "improved": True, "sortGroups": sort})
        build.build([reordered], work / "options" / name, runtime=runtime, plan={"themes": ["light"], "replace": True})

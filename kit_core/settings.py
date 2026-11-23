"""Tuỳ chọn hành vi trong `design-sync.json` (ngoài tên, cỡ khung, khung đích): mọi khoá đều có mặc định = hành vi kit gốc.

Mỗi dự án chọn cách làm của mình: vẽ lại màn đang chạy rồi sửa trực tiếp, hoặc sinh màn mới / bản đề xuất, hoặc cả hai.
Các tính năng đồng bộ nâng cao (cây Section, merge 3 chiều, Xem trước, nhãn màn, dọn khu…) đều tắt cho tới khi bật ở đây.
"""

from __future__ import annotations

import re
from pathlib import Path

LAYOUTS = ("grid", "sections")
SYNCS = ("replace", "merge")
TOKEN_MODES = ("off", "button", "update")
LEVELS = ("area", "group", "flow")
DEFAULT_FILLS = {"area": None, "group": "#DCEAFB", "flow": "#EEF5FE"}
DEFAULTS = {
    "layout": "grid",
    "sectionLevels": list(LEVELS),
    "collapseSingleFlow": True,
    "sectionFills": DEFAULT_FILLS,
    "screenLabels": False,
    "sync": "replace",
    "preview": False,
    "cleanup": False,
    "tokens": "button",
    "sortGroups": False,
}
BOOLEANS = ("collapseSingleFlow", "preview", "cleanup", "sortGroups")
_HEX = re.compile(r"#[0-9A-Fa-f]{6}")


def _fail(source: Path, message: str) -> None:
    raise ValueError(f"{source}: {message}")


def _one_of(cfg: dict, source: Path, key: str, allowed: tuple) -> None:
    if cfg.get(key, DEFAULTS[key]) not in allowed:
        _fail(source, f"{key} phải là {' hoặc '.join(repr(v) for v in allowed)}.")


def _check_levels(levels, source: Path) -> None:
    ok = isinstance(levels, list) and levels and all(isinstance(v, str) for v in levels) and len(set(levels)) == len(levels)
    if not ok or any(v not in LEVELS for v in levels) or levels != [v for v in LEVELS if v in levels]:
        _fail(source, f"sectionLevels phải là danh sách không rỗng, đúng thứ tự area → group → flow, chỉ gồm {list(LEVELS)} (vd [\"group\", \"flow\"]).")


def _check_fills(fills, source: Path) -> None:
    if not isinstance(fills, dict) or set(fills) - set(LEVELS):
        _fail(source, f"sectionFills phải là đối tượng với khoá thuộc {list(LEVELS)}.")
    for level, color in fills.items():
        if color is not None and not (isinstance(color, str) and _HEX.fullmatch(color)):
            _fail(source, f"sectionFills.{level} phải là null (trong suốt) hoặc mã màu #RRGGBB.")


def validate_options(cfg: dict, source: Path) -> None:
    _one_of(cfg, source, "layout", LAYOUTS)
    _one_of(cfg, source, "sync", SYNCS)
    _one_of(cfg, source, "tokens", TOKEN_MODES)
    if cfg.get("screenLabels", False) not in (True, False, "name"):
        _fail(source, "screenLabels phải là false, true (tên layer + nhãn chữ trên khung) hoặc \"name\" (chỉ đặt tên layer).")
    for key in BOOLEANS:
        if not isinstance(cfg.get(key, DEFAULTS[key]), bool):
            _fail(source, f"{key} phải là true hoặc false.")
    _check_levels(cfg.get("sectionLevels", DEFAULTS["sectionLevels"]), source)
    _check_fills(cfg.get("sectionFills", {}), source)


def runtime_options(cfg: dict) -> dict:
    """Giá trị đã điền mặc định, nhúng vào DESIGN_CONFIG cho plugin."""
    out = {key: cfg.get(key, default) for key, default in DEFAULTS.items()}
    out["sectionLevels"] = list(out["sectionLevels"])
    out["sectionFills"] = {**DEFAULT_FILLS, **(cfg.get("sectionFills") or {})}
    return out

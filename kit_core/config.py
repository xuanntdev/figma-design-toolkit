"""Cấu hình dự án `design-sync.json`: tên plugin, cỡ khung, khung đích và tên khung của từng team.

Dự án của team nằm ở `<kit>/project/`: `design-sync.json`, `extension/`, `draft-plan.json` và `dist/` (bản build).
Team clone kit thành repo của mình và commit `project/`; kit gốc không bao giờ chứa thư mục này.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

from kit_core import settings

CONFIG_NAME = "design-sync.json"
DEFAULT_NAME = "Đồng bộ thiết kế"
DEFAULT_ID = "design-sync-toolkit"
TARGETS = ("improved", "current")
FRAME_PRESETS = {
    "mobile": {"width": 393, "height": 873, "perRow": 6},
    "tablet": {"width": 834, "height": 1194, "perRow": 4},
    "desktop": {"width": 1440, "height": 1024, "perRow": 3},
}
BRIDGE_DEFAULT_PORT = 8787
LABEL_KEYS = ("currentName", "improvedName", "currentSub", "improvedSub", "pageFeatures", "pageTokens")


def slug(text: str) -> str:
    """'Ứng dụng Thiết kế' -> 'ung-dung-thiet-ke' (dùng làm id plugin)."""
    ascii_text = unicodedata.normalize("NFKD", text.replace("đ", "d").replace("Đ", "D")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-") or DEFAULT_ID


def parse_frame(value) -> dict:
    """'desktop' | 'mobile' | 'tablet' | '1280x800' | {width, height, perRow?} -> {width, height, perRow}."""
    if isinstance(value, dict):
        width, height = int(value["width"]), int(value["height"])
        return {"width": width, "height": height, "perRow": int(value.get("perRow") or auto_per_row(width))}
    text = str(value).strip().lower()
    if text in FRAME_PRESETS:
        return dict(FRAME_PRESETS[text])
    m = re.fullmatch(r"(\d+)\s*[x×]\s*(\d+)", text)
    if not m:
        raise ValueError(f"Cỡ khung {value!r} không hợp lệ. Dùng {', '.join(FRAME_PRESETS)} hoặc RỘNGxCAO (vd 1280x800).")
    width, height = int(m.group(1)), int(m.group(2))
    return {"width": width, "height": height, "perRow": auto_per_row(width)}


def auto_per_row(width: int) -> int:
    return max(1, min(6, 2600 // max(width, 1)))


def default_config(name: str, frame: str = "desktop", target: str = "improved") -> dict:
    return {"name": name, "id": slug(name), "frame": frame, "target": target, "labels": {}}


def validate(cfg: dict, source: Path) -> dict:
    if cfg.get("target", "improved") not in TARGETS:
        raise ValueError(f"{source}: target phải là {' hoặc '.join(TARGETS)}.")
    parse_frame(cfg.get("frame", "mobile"))
    if not isinstance(cfg.get("improved", True), bool):
        raise ValueError(f"{source}: improved phải là true hoặc false.")
    if cfg.get("improved") is False and cfg.get("target", "improved") != "current":
        raise ValueError(f"{source}: improved=false (không có khu Cải tiến) thì target phải là current.")
    settings.validate_options(cfg, source)
    port = bridge_port(cfg, source)
    if not isinstance(cfg.get("readOnly", False), bool):
        raise ValueError(f'{source}: readOnly phải là true hoặc false.')
    if cfg.get("readOnly") and not port:
        raise ValueError(f'{source}: readOnly cần bật bridge.')
    unknown = set(cfg.get("labels") or {}) - set(LABEL_KEYS)
    if unknown:
        raise ValueError(f"{source}: labels không hỗ trợ {sorted(unknown)}. Chỉ nhận {list(LABEL_KEYS)}.")
    return cfg


def bridge_port(cfg: dict, source: Path | str = CONFIG_NAME) -> int | None:
    """Cầu nối localhost: `bridge: {"port": 8787}`. Không khai (hoặc false/null) = tắt, plugin không có quyền mạng. `init` ghi sẵn khoá này."""
    bridge = cfg.get("bridge")
    if bridge in (None, False):
        return None
    if not isinstance(bridge, dict):
        raise ValueError(f'{source}: bridge phải là đối tượng như {{"port": {BRIDGE_DEFAULT_PORT}}}.')
    unknown = set(bridge) - {"port"}
    port = bridge.get("port", BRIDGE_DEFAULT_PORT)
    if unknown or isinstance(port, bool) or not isinstance(port, int) or not 1024 <= port <= 65535:
        raise ValueError(f"{source}: bridge chỉ nhận port là số nguyên 1024–65535.")
    return port


def load(project: Path) -> dict:
    path = project / CONFIG_NAME
    if not path.is_file():
        return {}
    return validate(json.loads(path.read_text(encoding="utf-8")), path)


def write(project: Path, cfg: dict) -> Path:
    path = project / CONFIG_NAME
    path.write_text(json.dumps(validate(cfg, path), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def runtime(cfg: dict) -> dict:
    """Phần cấu hình plugin cần lúc chạy trong Figma (nhúng vào code.js thành DESIGN_CONFIG)."""
    out = {
        "name": cfg.get("name") or DEFAULT_NAME,
        "frame": parse_frame(cfg.get("frame", "mobile")),
        "target": cfg.get("target", "improved"),
        "improved": cfg.get("improved", True),
        "labels": cfg.get("labels") or {},
        **settings.runtime_options(cfg),
    }
    port = bridge_port(cfg)
    if port:
        out["bridge"] = {"port": port}
    if cfg.get("readOnly"):
        out["readOnly"] = True
    return out

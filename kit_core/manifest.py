"""Build the screenshot manifest that `syncCurrent` reads.

Screenshots live at ``<root>/current/<theme>/<screenId>.png`` (theme: ``light`` or ``dark``); the manifest
``<root>/current/manifest.json`` records the app version, commit, capture time and a sha256 per image, so the plugin
replaces only the images whose hash changed.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

THEMES = ("light", "dark")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def scan(current_dir: Path) -> list[dict]:
    """Every valid PNG, ordered by theme then screen id so the manifest is stable between runs."""
    screens: list[dict] = []
    for theme in THEMES:
        folder = current_dir / theme
        if not folder.is_dir():
            continue
        for png in sorted(folder.glob("*.png")):
            if not png.read_bytes().startswith(PNG_MAGIC):
                raise ValueError(f"Tệp {png} không phải ảnh PNG.")
            screens.append({"screenId": png.stem, "theme": theme, "file": f"{theme}/{png.name}", "sha256": sha256_of(png)})
    return screens


def build_manifest(root: Path, version: str, commit: str, captured_at: str | None = None) -> dict:
    current = root / "current"
    screens = scan(current)
    if not screens:
        raise ValueError(f"Không tìm thấy ảnh chụp trong {current}/<light|dark>/*.png.")
    stamp = captured_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"dir": "current", "app": {"version": version, "commit": commit, "capturedAt": stamp}, "screens": screens}


def write_manifest(root: Path, version: str, commit: str) -> Path:
    manifest = build_manifest(root, version, commit)
    out = root / "current" / "manifest.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out

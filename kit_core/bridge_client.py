"""Phía repo của cầu nối: `pull` (xin plugin đọc Figma và chờ kết quả) và `import-state` (nạp tệp JSON xuất từ plugin)."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from kit_core import bridge

OPEN_PLUGIN_HINT = "Mở plugin trong Figma Desktop, giữ cửa sổ mở rồi chạy lại."
PLUGIN_FRESH = 30  # giây: plugin hỏi /pending trong khoảng này thì coi là đang mở
AUTO_IDLE_MINUTES = 30


def call(port: int, method: str, path: str, timeout: float = 3, *, data=None, headers=None) -> dict:
    """Gọi cầu nối trên 127.0.0.1; ném OSError khi không kết nối được."""
    body = json.dumps(data).encode("utf-8") if data is not None else (b"" if method == "POST" else None)
    req = urllib.request.Request(f"http://{bridge.LOOPBACK}:{port}{path}", method=method, data=body, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return json.loads(exc.read().decode("utf-8") or "{}")


def alive(port: int) -> dict | None:
    try:
        info = call(port, "GET", "/status", timeout=1)
    except (OSError, ValueError):
        return None
    return info if info.get("bridge") == bridge.STATE_KIND else None


def start_server(port: int, script: Path, state_dir: Path, *, project_dir: Path | None = None) -> None:
    """Bật `serve` chạy nền (tự thoát sau AUTO_IDLE_MINUTES không có plugin hỏi) để pull dùng được ngay."""
    flags = {"creationflags": 0x00000008} if sys.platform == "win32" else {"start_new_session": True}
    cmd = [sys.executable, str(script)]
    if project_dir is not None:
        cmd.extend(["--project-dir", str(project_dir)])
    cmd.extend(["serve", "--port", str(port), "--state-dir", str(state_dir), "--idle-exit", str(AUTO_IDLE_MINUTES)])
    with (Path(tempfile.gettempdir()) / f"design-sync-bridge-{port}.log").open("a", encoding="utf-8") as log:
        subprocess.Popen(cmd, stdout=log, stderr=log, stdin=subprocess.DEVNULL, **flags)
    for _ in range(40):
        if alive(port):
            return
        time.sleep(0.15)
    raise ValueError(f"Không bật được cầu nối ở cổng {port} (cổng đang bị chiếm?). Chạy tay: python design_sync.py serve --port {port}")


def wait_request(port: int, rid: str, timeout: float, interval: float = 0.4) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        item = call(port, "GET", f"/request/{rid}")
        if item.get("state") == "done":
            return item.get("summary") or {}
        if item.get("state") == "error":
            raise ValueError(f"Plugin báo lỗi khi đọc Figma: {item.get('error')}")
        time.sleep(interval)
    call(port, "POST", f"/cancel/{rid}")
    age = (alive(port) or {}).get("pluginSeenAgo")
    if age is None or age > PLUGIN_FRESH:
        raise ValueError(f"Không thấy plugin trả lời sau {timeout:g}s. {OPEN_PLUGIN_HINT}")
    raise ValueError(f"Plugin đã nhận yêu cầu nhưng chưa gửi kết quả sau {timeout:g}s (file lớn? thử --timeout 180).")


def pull(port: int, script: Path, state_dir: Path, timeout: float = 60, *, project_dir: Path | None = None) -> dict:
    if not alive(port):
        start_server(port, script, state_dir, project_dir=project_dir)
    rid = call(port, "POST", "/request")["id"]
    return wait_request(port, rid, timeout)


def import_state(file: Path, state_dir: Path) -> dict:
    """Nạp một snapshot JSON có sẵn vào state_dir, cùng bố cục với cầu nối."""
    if not file.is_file():
        raise ValueError(f"Không tìm thấy tệp {file}.")
    try:
        payload = json.loads(file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{file} không phải JSON hợp lệ: {exc}") from None
    return bridge.write_state(state_dir, payload, via="import")

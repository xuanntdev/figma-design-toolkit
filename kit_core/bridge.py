"""Cầu nối cục bộ (tuỳ chọn): nhận trạng thái file Figma từ plugin và ghi vào `project/figma-state/`.

Chỉ lắng nghe 127.0.0.1. Plugin (cửa sổ UI mở trong Figma Desktop) POST trạng thái lên đây, hoặc hỏi `GET /pending`
để biết repo đang chờ một lần đọc (`design_sync.py pull`). Chỉ ghi trong thư mục figma-state, thay thế nguyên khối.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from kit_core.live_bridge import LiveSession

STATE_DIRNAME = "figma-state"
STATE_KIND = "figma-state"
STATE_VERSION = 1
LOOPBACK = "127.0.0.1"
MAX_BODY = 64 * 1024 * 1024
MAX_FILES = 5000
REQUEST_TTL = 600
FILE_RE = re.compile(r"^(?:index|tokens|components)\.json$|^screens/[A-Za-z0-9._-]{1,150}\.json$")
ORIGINS = {"null", "https://www.figma.com", "https://figma.com"}


def validate_payload(payload) -> dict:
    """Kiểm hình dạng: {kind, version, files: {đường dẫn tương đối: JSON}}; đường dẫn chỉ index/tokens/components/screens/*.json."""
    if not isinstance(payload, dict) or payload.get("kind") != STATE_KIND:
        raise ValueError(f"Dữ liệu không phải trạng thái Figma (kind phải là {STATE_KIND!r}).")
    if payload.get("version") != STATE_VERSION:
        raise ValueError(f"Phiên bản trạng thái {payload.get('version')!r} chưa hỗ trợ (cần {STATE_VERSION}).")
    files = payload.get("files")
    if not isinstance(files, dict) or "index.json" not in files or len(files) > MAX_FILES:
        raise ValueError("Thiếu files hoặc thiếu index.json.")
    for rel, content in files.items():
        if not FILE_RE.match(rel):
            raise ValueError(f"Đường dẫn không hợp lệ trong trạng thái: {rel!r}.")
        if not isinstance(content, (dict, list)):
            raise ValueError(f"Nội dung {rel} phải là JSON đối tượng hoặc mảng.")
    if not isinstance(files["index.json"], dict):
        raise ValueError("index.json phải là đối tượng.")
    return payload


def safe_target(root: Path, rel: str) -> Path:
    """Đường dẫn đích bên trong root; ném ValueError nếu thoát ra ngoài (path traversal)."""
    target = (root / rel).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        raise ValueError(f"Đường dẫn thoát khỏi thư mục trạng thái: {rel!r}.") from None
    return target


def dump_nodes(node: dict) -> str:
    """Cây node: mỗi node một dòng (diff git đọc được, file không phình do thụt lề)."""
    kids = node.get("c")
    flat = {k: v for k, v in node.items() if k != "c"}
    text = json.dumps(flat, ensure_ascii=False, separators=(",", ":"))
    if not kids:
        return text
    return text[:-1] + ',"c":[\n' + ",\n".join(dump_nodes(c) for c in kids) + "\n]}"


def dump_file(rel: str, content) -> str:
    """index/tokens/components: JSON thụt lề 1; screens/*.json: đầu tệp gọn + cây một node một dòng."""
    if rel.startswith("screens/") and isinstance(content, dict) and isinstance(content.get("tree"), dict):
        head = json.dumps({k: v for k, v in content.items() if k != "tree"}, ensure_ascii=False, separators=(",", ":"))
        return head[:-1] + (',' if len(head) > 2 else '') + '"tree":\n' + dump_nodes(content["tree"]) + "}\n"
    return json.dumps(content, ensure_ascii=False, indent=1) + "\n"


def summarize(index: dict) -> dict:
    counts = index.get("counts") or {}
    return {"readAt": index.get("readAt"), "receivedAt": index.get("receivedAt"), **{k: counts.get(k) for k in ("screens", "edited", "handmade")}}


def write_state(state_dir: Path, payload: dict, via: str = "bridge") -> dict:
    """Ghi trọn bộ trạng thái vào state_dir, thay bản trước (dựng ở thư mục tạm cùng cha rồi đổi tên)."""
    validate_payload(payload)
    state_dir = state_dir.resolve()
    state_dir.parent.mkdir(parents=True, exist_ok=True)
    tmp = state_dir.parent / f".{state_dir.name}.tmp-{os.getpid()}-{uuid.uuid4().hex[:8]}"
    old = tmp.with_name(tmp.name + ".old")
    index = dict(payload["files"]["index.json"], receivedAt=datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"), via=via)
    try:
        tmp.mkdir()
        for rel, content in {**payload["files"], "index.json": index}.items():
            target = safe_target(tmp, rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(dump_file(rel, content), encoding="utf-8")
        if state_dir.exists():
            state_dir.rename(old)
        try:
            tmp.rename(state_dir)
        except OSError:
            if old.exists() and not state_dir.exists():
                old.rename(state_dir)
            raise
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        if state_dir.exists():
            shutil.rmtree(old, ignore_errors=True)
    return summarize(index)


class Queue:
    """Hàng đợi yêu cầu đọc: `pull` tạo yêu cầu, plugin nhận qua /pending rồi gửi trạng thái kèm đúng id."""

    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.items: dict[str, dict] = {}
        self.plugin_seen: float | None = None
        self.activity = time.time()
        self.last: dict | None = None

    def add(self) -> str:
        with self.lock:
            self._prune()
            rid = uuid.uuid4().hex[:12]
            self.activity = time.time()
            self.items[rid] = {"state": "pending", "created": time.time()}
            return rid

    def pending(self) -> str | None:
        with self.lock:
            self.plugin_seen = time.time()
            open_ids = [r for r, v in self.items.items() if v["state"] == "pending"]
            return min(open_ids, key=lambda r: self.items[r]["created"]) if open_ids else None

    def finish(self, rid: str, state: str, **extra) -> bool:
        with self.lock:
            item = self.items.get(rid)
            if not item or item["state"] != "pending":
                return False
            item.update(extra, state=state)
            return True

    def get(self, rid: str) -> dict | None:
        with self.lock:
            return dict(self.items[rid]) if rid in self.items else None

    def plugin_age(self) -> float | None:
        return None if self.plugin_seen is None else time.time() - self.plugin_seen

    def _prune(self) -> None:
        for rid in [r for r, v in self.items.items() if time.time() - v["created"] > REQUEST_TTL]:
            del self.items[rid]


def make_server(state_dir: Path, port: int, host: str = LOOPBACK, key: str | None = None) -> ThreadingHTTPServer:
    if host != LOOPBACK:
        raise ValueError(f"Cầu nối chỉ được lắng nghe {LOOPBACK}, không nhận {host!r}.")
    server = ThreadingHTTPServer((host, port), Handler)
    server.state_dir = Path(state_dir)
    server.queue = Queue()
    server.live = LiveSession(key, lambda payload: write_state(server.state_dir, payload)) if key else None
    return server


class Handler(BaseHTTPRequestHandler):
    server_version = "DesignSyncBridge/1"

    def log_message(self, *args) -> None:  # im lặng: lệnh serve tự in tóm tắt
        pass

    def _send(self, code: int, body: dict) -> None:
        data = b"" if code == 204 else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        for key, value in (("Allow-Origin", "*"), ("Allow-Methods", "GET, POST, OPTIONS"), ("Allow-Headers", "Content-Type, X-Design-Sync-Key"), ("Allow-Private-Network", "true"), ("Max-Age", "600")):
            self.send_header(f"Access-Control-{key}", value)
        self.end_headers()
        self.wfile.write(data)

    def _allowed(self) -> bool:
        """Chặn trang web lạ (Origin) và DNS rebinding (Host); plugin Figma có Origin 'null' hoặc không có."""
        origin = self.headers.get("Origin")
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
        return (origin is None or origin in ORIGINS) and host in (LOOPBACK, "localhost")

    def _route(self, method: str) -> None:
        if not self._allowed():
            return self._send(403, {"ok": False, "error": "Origin/Host không được phép."})
        try:
            parts = self.path.split("?", 1)[0].strip("/").split("/")
            if parts[0] == "live" and self.server.live:
                return self.server.live.route(self, method, parts[1:])
            if self.server.live and parts[0] not in ("", "status"):
                return self._send(403, {"error": "Dùng cầu nối đã ghép của dự án."})
            handler = getattr(self, f"_{method}_" + (self.path.split("?")[0].strip("/").split("/")[0] or "status"), None)
            if handler is None:
                return self._send(404, {"ok": False, "error": "Không có đường dẫn này."})
            handler()
        except ValueError as exc:
            self._send(400, {"ok": False, "error": str(exc)})

    def do_OPTIONS(self) -> None:
        self._send(204 if self._allowed() else 403, {"ok": False})

    def do_GET(self) -> None:
        self._route("get")

    def do_POST(self) -> None:
        self._route("post")

    def _body(self) -> dict:
        size = int(self.headers.get("Content-Length") or 0)
        if size <= 0 or size > MAX_BODY:
            raise ValueError("Thân yêu cầu rỗng hoặc quá lớn.")
        try:
            return json.loads(self.rfile.read(size).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError(f"JSON không hợp lệ: {exc}") from None

    def _tail(self) -> str:
        parts = self.path.split("?")[0].strip("/").split("/")
        return parts[1] if len(parts) > 1 else ""

    def _get_status(self) -> None:
        q = self.server.queue
        age = q.plugin_age()
        self._send(200, {"ok": True, "bridge": STATE_KIND, "paired": self.server.live is not None, "pluginSeenAgo": None if age is None else round(age, 1), "last": q.last})

    def _get_pending(self) -> None:
        rid = self.server.queue.pending()
        self._send(200, {"pending": {"id": rid} if rid else None})

    def _get_request(self) -> None:
        item = self.server.queue.get(self._tail())
        self._send(200 if item else 404, item or {"state": "unknown"})

    def _post_request(self) -> None:
        self._send(200, {"id": self.server.queue.add()})

    def _post_cancel(self) -> None:
        self._send(200, {"cancelled": self.server.queue.finish(self._tail(), "cancelled")})

    def _post_state(self) -> None:
        payload, q = self._body(), self.server.queue
        rid = payload.get("requestId") if isinstance(payload, dict) else None
        with q.lock:
            q.activity = time.time()
            if rid is not None and (not isinstance(rid, str) or (q.get(rid) or {}).get("state") != "pending"):
                return self._send(409, {"ok": False, "ignored": "stale", "error": "Yêu cầu đọc đã quá hạn hoặc không tồn tại."})
            if isinstance(payload, dict) and payload.get("error"):
                message = str(payload["error"])[:500]
                if rid:
                    q.finish(rid, "error", error=message)
                return self._send(200, {"ok": False, "error": message})
            summary = write_state(self.server.state_dir, payload, via="bridge")
            q.last = summary
            if rid is not None:
                q.finish(rid, "done", summary=summary)
        self._send(200, {"ok": True, "summary": summary})


def serve(state_dir: Path, port: int, idle_minutes: float | None = None, key: str | None = None) -> None:
    """Chạy cho tới Ctrl+C (hoặc sau idle_minutes không có yêu cầu nào nếu được đặt)."""
    server = make_server(state_dir, port, key=key)
    print(f"Cầu nối nghe tại http://{LOOPBACK}:{server.server_address[1]} · ghi vào {Path(state_dir).resolve()} · Ctrl+C để dừng", flush=True)
    if idle_minutes:
        threading.Thread(target=_idle_watch, args=(server, idle_minutes * 60), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def _idle_watch(server: ThreadingHTTPServer, limit: float) -> None:
    """Tự thoát khi plugin không hỏi /pending và không có yêu cầu mới trong `limit` giây (server do `pull` tự bật)."""
    while True:
        time.sleep(5)
        q = server.queue
        age = q.plugin_age()
        if server.live and server.live.status()["session"]:
            q.activity = time.time()
        quiet = min(time.time() - q.activity, age if age is not None else limit + 1)
        if quiet > limit:
            server.shutdown()
            return

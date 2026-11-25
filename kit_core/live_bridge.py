"""Phiên Figma cục bộ và hàng đợi thao tác trực tiếp."""

import hmac
import os
import secrets
import time
from threading import RLock


KEY_FILE = ".bridge-key"
# Chromium can reduce background popup timers to one tick per minute.
LEASE = 90
JOB_TTL = 600
# Lệnh đang chạy (đọc trọn file lớn có thể lâu) giữ lâu hơn lệnh chờ/đã xong.
RUNNING_TTL = 6 * 3600
COMMANDS = {"state", "selection", "tree", "find", "lint", "impact", "exportPng", "edit", "create", "protect", "stage"}


class SessionChanged(ValueError):
    pass


class SessionInUse(ValueError):
    pass


def key_for(project):
    path = project / KEY_FILE
    if not path.is_file():
        try:
            with os.fdopen(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "w") as stream:
                stream.write(secrets.token_hex(32))
        except FileExistsError:
            pass
    value = path.read_text(encoding="ascii").strip()
    if len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
        raise ValueError("Khóa cầu nối không hợp lệ. Kiểm lại .bridge-key rồi build plugin.")
    return value


class LiveSession:
    def __init__(self, key, save_state):
        self.key = key
        self.save_state = save_state
        self.lock = RLock()
        self.session = None
        self.seen = 0
        self.jobs = {}
        self.batch = None

    def status(self):
        active = time.monotonic() - self.seen < LEASE
        return {"session": self.session if active else None, "batch": self.batch if active else None}

    def attach(self, body):
        if self.status()["session"]:
            raise SessionInUse("Đã ghép một file. Ngắt kết nối trong plugin đang mở trước.")
        if not isinstance(body.get("file"), str) or not body["file"]:
            raise ValueError("Thiếu tên file Figma.")
        self.session = {"id": secrets.token_hex(16), "file": body["file"][:500]}
        self.seen = time.monotonic()
        self.jobs.clear()
        self.batch = None
        return self.session

    def require_session(self, body, *, from_plugin=False):
        # A suspended popup can resume its original session unless another popup took over.
        session = self.session if from_plugin else self.status()["session"]
        if not session or body.get("session") != session["id"]:
            raise SessionChanged("Phiên Figma đã đổi hoặc hết hạn. Mở plugin và kết nối lại.")
        if from_plugin:
            self.seen = time.monotonic()

    def request(self, body):
        command, args = body.get("command"), body.get("args", {})
        if command not in COMMANDS or not isinstance(args, dict):
            raise ValueError("Lệnh hoặc đối số Figma không hợp lệ.")
        if command == "stage" and self.batch and self.batch["state"] in ("ready", "applying"):
            raise ValueError("Đã có lượt chờ Cập nhật. Áp dụng hoặc bỏ lượt đó trong plugin.")
        rid = secrets.token_hex(12)
        self.jobs[rid] = {"id": rid, "command": command, "args": args, "state": "pending", "created": time.monotonic()}
        return {"id": rid}

    def poll(self):
        job = next((j for j in self.jobs.values() if j["state"] == "pending"), None)
        if job:
            job["state"] = "running"
        return {"job": job, "batch": self.batch}

    def result(self, rid, body):
        job = self.jobs.get(rid)
        if not job or job["state"] != "running":
            raise ValueError("Lệnh đã hết hạn hoặc đã nhận kết quả.")
        error, result = body.get("error"), body.get("result")
        try:
            if not error and job["command"] == "state":
                result["files"]["index.json"]["documentSession"] = self.session["id"]
                result = self.save_state(result)
            if not error and job["command"] == "stage" and result.get("changes"):
                self.batch = {"id": rid, "state": "ready", "preview": result}
        except (ValueError, TypeError, KeyError, OSError) as exc:
            error = str(exc)
        job.update(state="error" if error else "done", result=result if not error else None, error=error)
        return {"ok": True}

    def batch_action(self, action, body):
        if not self.batch or self.batch["id"] != body.get("id"):
            raise ValueError("Lượt cập nhật đã thay đổi. Đọc lại danh sách.")
        if action == "begin" and self.batch["state"] == "ready":
            self.batch["state"] = "applying"
        elif action == "finish" and self.batch["state"] == "applying":
            self.batch.update(state="error" if body.get("error") else "done", result=body.get("result"), error=body.get("error"))
        elif action == "discard" and self.batch["state"] == "ready":
            self.batch = None
        else:
            raise ValueError("Lượt cập nhật không còn ở trạng thái phù hợp.")
        return {"ok": True}

    def route(self, handler, method, tail):
        if not hmac.compare_digest(handler.headers.get("X-Design-Sync-Key", ""), self.key):
            return handler._send(403, {"error": "Cầu nối thuộc checkout khác hoặc plugin cần build lại."})
        body = handler._body() if method == "post" else {}
        if not isinstance(body, dict):
            raise ValueError("Yêu cầu cần là một đối tượng JSON.")
        try:
            with self.lock:
                result = self.dispatch(method, tail, body)
        except SessionChanged as exc:
            return handler._send(400, {"error": str(exc), "code": "session_changed"})
        except SessionInUse as exc:
            return handler._send(400, {"error": str(exc), "code": "session_in_use"})
        handler._send(200, result)

    def dispatch(self, method, tail, body):
        moment = time.monotonic()
        self.jobs = {rid: job for rid, job in self.jobs.items() if moment - job["created"] < (RUNNING_TTL if job["state"] == "running" else JOB_TTL)}
        if method == "get" and tail == ["status"]:
            return self.status()
        if method == "get" and len(tail) == 2 and tail[0] == "result":
            return self.jobs.get(tail[1], {"state": "unknown"})
        if method != "post":
            raise ValueError("Đường dẫn cầu nối không hợp lệ.")
        if tail == ["attach"]:
            return self.attach(body)
        from_plugin = bool(tail) and tail[0] in {"poll", "touch", "detach", "result", "batch"}
        self.require_session(body, from_plugin=from_plugin)
        if tail == ["detach"]:
            self.session = None
            self.batch = None
            return {"ok": True}
        if tail == ["poll"]:
            return self.poll()
        if tail == ["touch"]:
            return {"ok": True}
        if tail == ["request"]:
            return self.request(body)
        if len(tail) == 2 and tail[0] == "result":
            return self.result(tail[1], body)
        if len(tail) == 2 and tail[0] == "cancel":
            job = self.jobs.get(tail[1], {})
            if job.get("state") == "pending":
                job["state"] = "cancelled"
            return {"state": job.get("state", "unknown")}
        if len(tail) == 2 and tail[0] == "batch":
            return self.batch_action(tail[1], body)
        raise ValueError("Đường dẫn cầu nối không hợp lệ.")

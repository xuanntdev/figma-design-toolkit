"""CLI gửi lệnh tới phiên được ghép bằng popup Figma."""

import json
import time
from pathlib import Path

from kit_core import bridge_client
from kit_core.live_bridge import key_for


class Client:
    def __init__(self, port, script, project, state_dir, start=True):
        self.port = port
        self.key = key_for(project)
        self.headers = {"X-Design-Sync-Key": self.key}
        if not bridge_client.alive(port) and start:
            bridge_client.start_server(port, script, state_dir, project_dir=project)
        self.status()

    def call(self, method, route, data=None):
        info = bridge_client.call(self.port, method, "/live/" + route, data=data, headers=self.headers)
        if info.get("error"):
            raise ValueError(info["error"])
        return info

    def status(self):
        info = self.call("GET", "status")
        if "session" not in info:
            raise ValueError("Cổng thuộc bridge phiên bản cũ. Dừng bridge cũ hoặc đổi cổng và build lại.")
        return info

    def request(self, command, args, timeout):
        session = self.status().get("session")
        if not session:
            raise ValueError("Mở plugin trong đúng file Figma và bấm Kết nối file.")
        expected = args.pop("session", None)
        if expected is not None and expected != session["id"]:
            raise ValueError("Phiên đang mở đã khác phiên của yêu cầu. Đọc lại đích.")
        data = {"session": session["id"], "command": command, "args": args}
        rid = self.call("POST", "request", data)["id"]
        return self.wait(rid, session, timeout)

    def wait(self, rid, session, timeout):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            info = self.call("GET", "result/" + rid)
            if info.get("state") == "done":
                return {"session": session["id"], "file": session["file"], "result": info["result"]}
            if info.get("state") in {"cancelled", "unknown"}:
                raise ValueError("Phiên Figma hoặc yêu cầu đã hết hạn.")
            time.sleep(0.2)
        status = self.call("POST", "cancel/" + rid, {"session": session["id"]})
        if status["state"] == "cancelled":
            raise ValueError("Plugin chưa nhận lệnh. Yêu cầu đã hủy.")
        raise ValueError(f"Plugin có thể đang xử lý lệnh {rid}. Đọc lại Figma trước khi gửi lệnh ghi lần nữa.")


def load_args(path: Path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict):
        raise ValueError("Kế hoạch cần là một đối tượng JSON.")
    return data

"""Kiểm bridge đã ghép qua HTTP và CLI trên một project độc lập."""

import base64
import json
import subprocess
import sys
import time
from pathlib import Path
from threading import Thread

from kit_core import bridge
from kit_core.live_bridge import LEASE, key_for
from .verify_bridge import GOOD, http_call

PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLU8AAAAASUVORK5CYII="


def verify_live_cli(kit, project=None):
    cli = [sys.executable, "-B", str(kit / "design_sync.py")]
    if project is None:
        project = kit / "project"
    else:
        cli.extend(["--project-dir", str(project)])
    key = key_for(project)
    server = bridge.make_server(project / "figma-state", 0, key=key)
    port = server.server_address[1]
    runner = Thread(target=server.serve_forever, daemon=True)
    runner.start()
    headers = {"X-Design-Sync-Key": key, "Origin": "null"}
    config_path = project / "design-sync.json"
    original = config_path.read_text(encoding="utf-8")

    def send(method, tail, body=None, expected=200, auth=headers):
        code, _, value = http_call(port, method, "/live/" + tail, body, auth)
        assert code == expected, (code, value)
        return value

    try:
        cfg = json.loads(original)
        cfg["bridge"]["port"] = port
        config_path.write_text(json.dumps(cfg), encoding="utf-8")
        subprocess.run([*cli, "build"], cwd=kit, check=True, capture_output=True)
        doctor = [*cli, "doctor"]
        assert not json.loads(subprocess.check_output(doctor, cwd=kit))["ready"]
        manifest = project / "dist/ui.html"
        html = manifest.read_text(encoding="utf-8")
        assert "Kết nối file" in html and "liveHandleUpdate" in html and key in html
        assert key not in (project / "dist/code.js").read_text(encoding="utf-8")
        send("POST", "attach", {"file": "Sai checkout"}, 403, {})
        session = send("POST", "attach", {"file": "Figma thử"})["id"]
        data = {"session": session}
        assert json.loads(subprocess.check_output(doctor, cwd=kit))["ready"]
        assert send("POST", "attach", {"file": "File thứ hai"}, 400)["code"] == "session_in_use"
        send("POST", "request", {"session": "wrong", "command": "edit"}, 400)
        verify_reads(cli, project, port, send, data)
        verify_png(cli, project, send, data)
        verify_batch(send, data)
        verify_paused_popup(server, send, data)
        send("POST", "detach", data)
        new = send("POST", "attach", {"file": "Figma khác"})["id"]
        assert new != session
        send("POST", "poll", data, 400)
    finally:
        config_path.write_text(original, encoding="utf-8")
        server.shutdown()
        server.server_close()
        runner.join(timeout=2)
    print("verify_live.py: khóa checkout, ghép file, CLI selection/pull và hàng đợi Cập nhật đạt")


def verify_paused_popup(server, send, data):
    request = {**data, "command": "state"}
    rid = send("POST", "request", request)["id"]
    assert send("POST", "poll", data)["job"]["id"] == rid
    with server.live.lock:
        server.live.seen -= LEASE + 1
    assert send("GET", "status")["session"] is None
    assert send("POST", "request", request, 400)["code"] == "session_changed"
    send("POST", "result/" + rid, {**data, "result": GOOD})
    assert send("GET", "result/" + rid)["state"] == "done"
    assert send("GET", "status")["session"]["id"] == data["session"]

    with server.live.lock:
        server.live.seen -= LEASE + 1
    resumed = send("POST", "poll", data)
    assert resumed["batch"]["state"] == "done"
    assert send("GET", "status")["session"]["id"] == data["session"]


def verify_reads(cli, project, port, send, data):
    for command, request, result in (("selection", "selection", {"selection": []}), ("pull", "state", GOOD)):
        process = subprocess.Popen([*cli, command, "--port", str(port), "--timeout", "5"],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for _ in range(100):
            job = send("POST", "poll", data)["job"]
            if job:
                assert job["command"] == request
                send("POST", "result/" + job["id"], {**data, "result": result})
                break
            time.sleep(0.025)
        output, error = process.communicate(timeout=7)
        assert process.returncode == 0, error.decode("utf-8", errors="replace")
        if request == "selection":
            text = output.decode("utf-8")
            assert data["session"] in text and "selection trống" in text, text
    snapshot = json.loads((project / "figma-state/index.json").read_text(encoding="utf-8"))
    assert snapshot["documentSession"] == data["session"]
    verify_compact_reads(cli, port, send, data)


def verify_compact_reads(cli, port, send, data):
    """tree / find / lint in bản gọn; tham số CLI tới plugin đúng; --json vẫn in JSON thô."""
    tree = {"id": "1:2", "t": "FRAME", "n": "Màn", "w": 100, "h": 50, "lm": "V", "gap": 8, "c": [{"id": "1:3", "t": "TEXT", "n": "Tiêu đề", "chars": "Xin chào", "font": "Inter Bold", "size": 16, "w": 60, "h": 20}]}
    found = {"total": 3, "shown": 1, "hits": [{"id": "1:3", "t": "TEXT", "n": "Tiêu đề", "w": 60, "h": 20, "page": "P", "path": "Màn", "text": "Xin chào"}]}
    linted = {"scope": {"id": "1:2", "name": "Màn", "t": "FRAME"}, "counts": {"raw-fill": 2}, "colors": [{"hex": "#ffffff", "n": 2}], "shown": 1,
              "issues": [{"rule": "raw-fill", "id": "1:2", "t": "FRAME", "n": "Màn", "value": "#ffffff", "path": ""}]}
    cases = (
        (["tree", "1:2", "--depth", "20"], "tree", {"node": {"nodeId": "1:2", "frameId": "1:2", "screen": "Màn", "page": "P", "tree": tree}},
         {"nodeId": "1:2", "depth": 20}, ['text "Tiêu đề" #1:3', "flex col · gap 8", "JSON của lần đọc này:"]),
        (["find", "chao", "--type", "TEXT", "--limit", "1"], "find", found, {"query": "chao", "types": ["TEXT"], "limit": 1},
         ["3 kết quả, in 1", '#1:3 TEXT "Tiêu đề"', "còn kết quả"]),
        (["lint", "--within", "1:2", "--rule", "raw-fill"], "lint", linted, {"within": "1:2", "rules": ["raw-fill"]},
         ["raw-fill 2", "#ffffff×2", 'raw-fill · #1:2 FRAME "Màn"', "in 1/2"]),
        (["find", "x", "--json"], "find", found, {"query": "x"}, ['"total": 3']),
    )
    for args, request, result, expect_args, expect in cases:
        process = subprocess.Popen([*cli, *args, "--port", str(port), "--timeout", "5"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for _ in range(100):
            job = send("POST", "poll", data)["job"]
            if job:
                assert job["command"] == request and job["args"] == expect_args, job
                send("POST", "result/" + job["id"], {**data, "result": result})
                break
            time.sleep(0.025)
        output, error = process.communicate(timeout=7)
        assert process.returncode == 0, error.decode("utf-8", errors="replace")
        text = output.decode("utf-8")
        assert all(e in text for e in expect), text


def verify_batch(send, data):
    rid = send("POST", "request", {**data, "command": "stage", "args": {"edits": []}})["id"]
    assert send("POST", "poll", data)["job"]["id"] == rid
    changes = {"changes": [{"page": "A", "screen": "B"}], "blocked": []}
    send("POST", "result/" + rid, {**data, "result": changes})
    assert send("GET", "status")["batch"]["state"] == "ready"
    send("POST", "batch/finish", {**data, "id": rid}, 400)
    send("POST", "batch/begin", {**data, "id": rid})
    send("POST", "batch/begin", {**data, "id": rid}, 400)
    send("POST", "batch/finish", {**data, "id": rid, "result": {"changed": 1}})
    assert send("GET", "status")["batch"]["state"] == "done"


def verify_png(cli, project, send, data):
    png = project / "frame.png"
    process = subprocess.Popen([*cli, "export-png", "1:2", "--out", str(png), "--session", data["session"], "--timeout", "5"],
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    for _ in range(100):
        job = send("POST", "poll", data)["job"]
        if job:
            assert job["command"] == "exportPng" and job["args"] == {"nodeId": "1:2", "scale": 1}
            send("POST", "result/" + job["id"], {**data, "result": {"nodeId": "1:2", "base64": PNG}})
            break
        time.sleep(0.025)
    output, error = process.communicate(timeout=7)
    assert process.returncode == 0, error.decode("utf-8", errors="replace")
    receipt = json.loads(output)
    assert receipt["result"] == {"nodeId": "1:2"} and Path(receipt["path"]) == png
    assert png.read_bytes() == base64.b64decode(PNG)

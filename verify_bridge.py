"""Kiểm cầu nối cục bộ + chiều Figma -> repo: validate/ghi atomically, HTTP (CORS, Origin/Host, traversal), hàng đợi pull, import-state, figma-diff.

Chạy: python verify_bridge.py [thư mục state-out do verify_state.js ghi (STATE_OUT_DIR)]
"""

import http.client
import json
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from tempfile import TemporaryDirectory

KIT = Path(__file__).resolve().parent
sys.path.insert(0, str(KIT))
from kit_core import bridge, bridge_client, figma_diff, figma_diff_render  # noqa: E402

INDEX = {"readAt": "2026-01-01T00:00:00Z", "counts": {"screens": 1, "edited": 0, "handmade": 0}, "screens": []}
GOOD = {"kind": "figma-state", "version": 1, "files": {"index.json": INDEX, "screens/a.json": {"tree": {"t": "FRAME", "n": "A"}}}}


def raises(fn, text: str) -> None:
    try:
        fn()
    except ValueError as exc:
        assert text in str(exc), f"{text!r} không có trong {exc}"
        return
    raise AssertionError(f"Phải ném ValueError chứa {text!r}")


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def http_call(port: int, method: str, path: str, body=None, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    data = json.dumps(body).encode() if body is not None else None
    conn.request(method, path, body=data, headers={"Content-Type": "text/plain;charset=UTF-8", **(headers or {})})
    resp = conn.getresponse()
    raw = resp.read()
    conn.close()
    return resp.status, dict(resp.getheaders()), (json.loads(raw) if raw else None)


def check_payload_and_write(root: Path) -> None:
    for bad_path in ("../x.json", "screens/../a.json", "screens/a/b.json", "/etc/passwd.json", "screens/a.txt", "other.json", "screens\\a.json"):
        raises(lambda p=bad_path: bridge.validate_payload({**GOOD, "files": {**GOOD["files"], p: {}}}), "Đường dẫn không hợp lệ")
    raises(lambda: bridge.validate_payload({**GOOD, "kind": "x"}), "không phải trạng thái Figma")
    raises(lambda: bridge.validate_payload({**GOOD, "version": 9}), "chưa hỗ trợ")
    raises(lambda: bridge.validate_payload({**GOOD, "files": {"screens/a.json": {}}}), "index.json")
    raises(lambda: bridge.safe_target(root / "s", "../escape.json"), "thoát khỏi")
    state = root / "figma-state"
    bridge.write_state(state, GOOD)
    assert json.loads((state / "index.json").read_text(encoding="utf-8"))["via"] == "bridge"
    assert (state / "screens/a.json").is_file()
    tree = {"key": "t", "tree": {"t": "FRAME", "n": 'có "ngoặc"', "c": [{"t": "TEXT", "chars": "Lưu"}, {"t": "FRAME", "c": [{"t": "TEXT", "chars": "x"}]}]}}
    bridge.write_state(state, {**GOOD, "files": {**GOOD["files"], "screens/t.json": tree}})
    text = (state / "screens/t.json").read_text(encoding="utf-8")
    assert json.loads(text) == tree and text.count("\n") >= 5, "screens ghi mỗi node một dòng và đọc lại đúng"
    newer = {**GOOD, "files": {"index.json": INDEX, "screens/b.json": {"tree": {}}}}
    bridge.write_state(state, newer, via="import")
    assert not (state / "screens/a.json").exists() and (state / "screens/b.json").is_file(), "bản mới thay hẳn bản cũ"
    assert sorted(p.name for p in root.iterdir()) == ["figma-state"], "không để lại thư mục tạm"


def start(state: Path):
    server = bridge.make_server(state, 0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, server.server_address[1]


def check_server_http(root: Path) -> None:
    raises(lambda: bridge.make_server(root / "x", 0, host="0.0.0.0"), "chỉ được lắng nghe")
    state = root / "figma-state"
    server, port = start(state)
    try:
        assert server.server_address[0] == "127.0.0.1"
        code, headers, _ = http_call(port, "OPTIONS", "/state", headers={"Origin": "null"})
        assert code == 204 and headers["Access-Control-Allow-Origin"] == "*" and headers["Access-Control-Allow-Private-Network"] == "true"
        code, headers, body = http_call(port, "POST", "/state", GOOD, {"Origin": "null"})
        assert code == 200 and body["ok"] and headers["Access-Control-Allow-Origin"] == "*" and (state / "index.json").is_file()
        code, _, body = http_call(port, "POST", "/state", {**GOOD, "files": {**GOOD["files"], "../evil.json": {}}})
        assert code == 400 and not (root / "evil.json").exists(), (code, body)
        assert http_call(port, "POST", "/state", GOOD, {"Origin": "https://evil.example"})[0] == 403
        assert http_call(port, "GET", "/pending", headers={"Host": "evil.example"})[0] == 403
        assert http_call(port, "GET", "/pending")[2] == {"pending": None}
        assert http_call(port, "GET", "/nope")[0] == 404
    finally:
        server.shutdown()
        server.server_close()


def fake_plugin(port: int, stop: threading.Event, answer_ids: list, delay: float = 0.3) -> None:
    """Giả lập cửa sổ plugin: hỏi /pending, thấy yêu cầu thì (sau delay) gửi trạng thái kèm id."""
    while not stop.is_set():
        try:
            pending = http_call(port, "GET", "/pending")[2]["pending"]
        except OSError:  # máy chủ vừa tắt lúc dọn dẹp
            return
        if pending and pending["id"] not in answer_ids:
            answer_ids.append(pending["id"])
            time.sleep(delay)
            http_call(port, "POST", "/state", {**GOOD, "requestId": pending["id"]}, {"Origin": "null"})
        time.sleep(0.1)


def check_queue(root: Path) -> None:
    state = root / "figma-state"
    server, port = start(state)
    stop, answered = threading.Event(), []
    try:
        # Không có plugin: pull hết hạn gọn gàng, báo mở plugin, và yêu cầu bị huỷ nên bài đăng muộn bị bỏ qua.
        started = time.time()
        raises(lambda: bridge_client.pull(port, KIT / "design_sync.py", state, timeout=1), "Mở plugin trong Figma Desktop (để cửa sổ plugin mở)")
        assert time.time() - started < 5 and not state.exists()
        stale_id = next(iter(server.queue.items))
        code, _, body = http_call(port, "POST", "/state", {**GOOD, "requestId": stale_id})
        assert code == 409 and body["ignored"] == "stale" and not state.exists(), "bài đăng id đã huỷ phải bị bỏ qua"
        assert http_call(port, "POST", "/state", {**GOOD, "requestId": "khong-co"})[0] == 409 and not state.exists()
        # Bài đăng sai id khi đang có yêu cầu thật: bị bỏ qua, yêu cầu thật vẫn chờ.
        rid = http_call(port, "POST", "/request")[2]["id"]
        assert http_call(port, "POST", "/state", {**GOOD, "requestId": "sai-id"})[0] == 409 and not state.exists()
        assert http_call(port, "GET", "/pending")[2]["pending"]["id"] == rid
        assert http_call(port, "GET", f"/request/{rid}")[2]["state"] == "pending"
        http_call(port, "POST", f"/cancel/{rid}")
        # Có plugin: pull chờ đúng id rồi trả tóm tắt, tệp được ghi.
        thread = threading.Thread(target=fake_plugin, args=(port, stop, answered), daemon=True)
        thread.start()
        summary = bridge_client.pull(port, KIT / "design_sync.py", state, timeout=10)
        assert summary["readAt"] == INDEX["readAt"] and summary["screens"] == 1 and (state / "index.json").is_file()
        assert len(answered) == 1 and http_call(port, "GET", f"/request/{answered[0]}")[2]["state"] == "done"
        # Plugin báo lỗi đọc: pull dừng ngay với thông điệp.
        err_id = http_call(port, "POST", "/request")[2]["id"]
        http_call(port, "POST", "/state", {"kind": "figma-state", "requestId": err_id, "error": "boom"})
        raises(lambda: bridge_client.wait_request(port, err_id, 2), "boom")
    finally:
        stop.set()
        server.shutdown()
        server.server_close()


def check_autostart(root: Path) -> None:
    """pull tự bật máy chủ nền khi chưa chạy; máy chủ tự thoát sau thời gian rảnh."""
    port, state = free_port(), root / "auto-state"
    bridge_client.AUTO_IDLE_MINUTES = 0.05
    stop, answered = threading.Event(), []
    plugin = None
    try:
        def late_plugin():
            for _ in range(100):
                if bridge_client.alive(port):
                    return fake_plugin(port, stop, answered, 0.1)
                time.sleep(0.1)
        plugin = threading.Thread(target=late_plugin, daemon=True)
        plugin.start()
        summary = bridge_client.pull(port, KIT / "design_sync.py", state, timeout=20)
        assert summary["screens"] == 1 and (state / "index.json").is_file()
        stop.set()
        for _ in range(60):
            if not bridge_client.alive(port):
                return
            time.sleep(0.5)
        raise AssertionError("máy chủ tự bật phải tự thoát khi rảnh")
    finally:
        stop.set()


def check_import(root: Path) -> None:
    file = root / "export.json"
    file.write_text(json.dumps(GOOD), encoding="utf-8")
    summary = bridge_client.import_state(file, root / "imported")
    assert summary["screens"] == 1 and json.loads((root / "imported/index.json").read_text(encoding="utf-8"))["via"] == "import"
    file.write_text("{bad", encoding="utf-8")
    raises(lambda: bridge_client.import_state(file, root / "imported"), "không phải JSON")
    raises(lambda: bridge_client.import_state(root / "none.json", root / "imported"), "Không tìm thấy")


def check_diff(root: Path, out: Path) -> None:
    """Đầu-cuối: payload thật do plugin (verify_state.js) -> import-state -> figma-diff thấy chữ, variant, khung vẽ tay, token lệch."""
    expect = json.loads((out / "expect.json").read_text(encoding="utf-8"))
    after = json.loads((out / "after.json").read_text(encoding="utf-8"))
    for var in after["files"]["tokens.json"]["collections"][0]["variables"]:
        if var["name"] == "c/red":
            var["resolved"] = "#fe0000"  # designer đổi màu token so với bảng của repo
    (root / "after-mod.json").write_text(json.dumps(after), encoding="utf-8")
    bridge_client.import_state(out / "before.json", root / "base")
    bridge_client.import_state(root / "after-mod.json", root / "cur")
    report = figma_diff.build_report(root / "cur", root / "base", False, None)
    changed = {e["screenId"]: e for e in report["screens"]["changed"]}
    assert set(changed) == {expect["screenId"]}, changed.keys()
    diff = changed[expect["screenId"]]["vsBase"]
    assert any(expect["text"] in t for t in diff["texts"]["added"]) and diff["texts"]["removed"], diff["texts"]
    if expect["variant"]:
        key, val = next(iter(expect["variant"].items()))
        assert any(c["kind"] == "variant" and c["field"] == "variant" and c["to"][key] == val for c in diff["changes"]), diff["changes"]
    assert [h["name"] for h in report["screens"]["handmade"]] == [expect["hand"]]
    repo = report["tokens"]["vsRepo"]
    assert [(r["kind"], r["name"]) for r in repo["variables"]] == [("changed", "c/red")] and report["tokens"]["vsBase"]["variables"]["changed"][0]["name"].endswith("c/red")
    text = figma_diff_render.render(report)
    assert expect["text"] in text and "KHUNG VẼ TAY" in text and "đổi variant" in text and "c/red" in text, text
    # CLI --json trên cùng dữ liệu; bản chốt trùng hiện tại thì không còn màn đổi.
    cli = [sys.executable, "-B", str(KIT / "design_sync.py"), "figma-diff", "--json", "--no-git", "--state-dir", str(root / "cur")]
    same = json.loads(subprocess.run([*cli, "--base", str(root / "cur")], capture_output=True, text=True, check=True).stdout)
    assert not any("vsBase" in c for c in same["screens"]["changed"]), "bản chốt trùng hiện tại thì không có chênh lệch từng node"
    out_json = json.loads(subprocess.run([*cli, "--base", str(root / "base")], capture_output=True, text=True, check=True).stdout)
    assert out_json["screens"]["changed"][0]["screenId"] == expect["screenId"]
    nobase = figma_diff.build_report(root / "cur", None, False, None)
    assert nobase["base"] is None and nobase["tokens"]["vsBase"] is None


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    with TemporaryDirectory(prefix="design-sync-bridge-") as temp:
        root = Path(temp)
        for name, fn in (("payload+ghi", check_payload_and_write), ("http", check_server_http), ("hàng đợi pull", check_queue), ("tự bật", check_autostart), ("import-state", check_import)):
            (root / name.split()[0]).mkdir()
            fn(root / name.split()[0])
            print(f"verify_bridge: {name} đạt")
        if out:
            (root / "diff").mkdir()
            check_diff(root / "diff", out)
            print("verify_bridge: figma-diff đầu-cuối đạt")
    print("verify_bridge.py: OK")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

#!/usr/bin/env python3
"""Tiny control API for the QEMU-hosted TempleOS VM.

Talks to QEMU's HMP monitor over a Unix socket to implement restart/pause/
resume, since the RFB/VNC protocol itself carries no such commands. Uses
only the Python standard library -- no extra dependencies to keep the image
small.
"""

import http.server
import json
import os
import socket
import time

MONITOR_SOCK = os.environ.get("QEMU_MONITOR_SOCK", "/tmp/qemu-monitor.sock")
CONTROL_PORT = int(os.environ.get("CONTROL_PORT", "8081"))


def _drain(sock: socket.socket, idle_timeout: float = 0.4) -> str:
    sock.settimeout(idle_timeout)
    chunks = []
    try:
        while True:
            part = sock.recv(4096)
            if not part:
                break
            chunks.append(part)
    except socket.timeout:
        pass
    return b"".join(chunks).decode(errors="replace")


def send_monitor_command(command: str, timeout: float = 5.0) -> str:
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect(MONITOR_SOCK)
        _drain(sock)  # discard QEMU's banner + initial "(qemu) " prompt
        sock.sendall((command + "\n").encode())
        time.sleep(0.1)
        return _drain(sock)
    finally:
        sock.close()


class Handler(http.server.BaseHTTPRequestHandler):
    def _json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        actions = {
            "/restart": "system_reset",
            "/pause": "stop",
            "/resume": "cont",
        }
        command = actions.get(self.path)
        if command is None:
            self._json({"ok": False, "error": "unknown action"}, 404)
            return
        try:
            send_monitor_command(command)
            self._json({"ok": True, "action": self.path.strip("/")})
        except OSError as err:
            self._json({"ok": False, "error": f"could not reach QEMU monitor: {err}"}, 502)

    def do_GET(self):
        if self.path != "/status":
            self._json({"ok": False, "error": "not found"}, 404)
            return
        try:
            raw = send_monitor_command("info status")
            self._json(
                {
                    "ok": True,
                    "running": "running" in raw,
                    "paused": "paused" in raw,
                }
            )
        except OSError as err:
            self._json({"ok": False, "error": f"could not reach QEMU monitor: {err}"}, 502)

    def log_message(self, fmt, *args):
        print(f"[control] {self.address_string()} {fmt % args}")


def main():
    server = http.server.ThreadingHTTPServer(("0.0.0.0", CONTROL_PORT), Handler)
    print(f"[control] listening on :{CONTROL_PORT}, QEMU monitor at {MONITOR_SOCK}")
    server.serve_forever()


if __name__ == "__main__":
    main()

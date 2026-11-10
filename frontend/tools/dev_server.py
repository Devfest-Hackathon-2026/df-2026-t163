#!/usr/bin/env python3
"""
開発用サーバー（ブラウザにキャッシュさせない版）

  python3 tools/dev_server.py          # Windows は python tools\\dev_server.py
  python3 tools/dev_server.py 8080     # ポートを変えるとき

python3 -m http.server だと、iPhone の Safari などが古い JS / CSS を覚えたまま使い、
新しいファイルと混ざって画面が崩れることがある。このサーバーは毎回「保存しないで」と伝える。
起動するとスマホで開く URL も表示する。
"""
import functools
import http.server
import os
import socket
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # frontend フォルダ


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def lan_ip():
    """同じ Wi-Fi のスマホから見たこのパソコンの IP アドレス（実際の通信はしない）"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.168.0.1", 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler)
    ip = lan_ip()
    print(f"パソコン: http://localhost:{PORT}/?mock=1")
    if ip:
        print(f"スマホ  : http://{ip}:{PORT}/?mock=1   （同じ Wi-Fi で開く）")
    print("止めるときは Ctrl + C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass

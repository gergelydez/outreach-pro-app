import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

OLD_SITE = """<html><head><title>Welcome</title><meta name="generator" content="WordPress 4.9.8">
<script src="/js/jquery-1.8.3.min.js"></script></head>
<body><table width="100%"><tr><td><table><tr><td><a href="/"><img src="logo.gif"></a></td></tr></table>
<font>Kings Heath Plumbing</font><font>Boilers</font><font>Call 0121 444 1234</font>
<p>Email info@kingsheathplumbing.co.uk</p><p>&copy; 2016 Kings Heath Plumbing</p></td></tr></table></body></html>"""

MODERN_SITE = """<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Electrician Birmingham | Brummie Sparks</title><meta name="description" content="NICEIC electricians in Birmingham">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Electrician","address":{"postalCode":"B14 7QH"}}</script></head>
<body><header><nav><a href="/">Home</a><a href="/services/rewiring">Rewiring</a><a href="/services/ev-chargers">EV chargers</a><a href="/contact">Contact</a></nav></header>
<h1>Birmingham electricians</h1><a class="btn" href="tel:+441214445555">Call now</a><a href="https://wa.me/447700900222">WhatsApp us</a>
<form action="/quote"><input type="text" name="name"><input type="tel" name="phone"><textarea name="job"></textarea><button>Get a free quote</button></form>
<footer>Unit 4, Kings Heath, Birmingham B14 7QH · © 2019–2026 Brummie Sparks Ltd</footer></body></html>"""


class _Handler(BaseHTTPRequestHandler):
    routes: dict = {}

    def do_GET(self):  # noqa: N802
        r = self.routes.get(self.path)
        if r is None:
            self.send_response(404); self.end_headers(); self.wfile.write(b"not found"); return
        status, headers, body = r
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body if isinstance(body, bytes) else body.encode())

    def log_message(self, *a):
        pass


@pytest.fixture()
def server():
    _Handler.routes = {}
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    yield base, _Handler.routes
    srv.shutdown()

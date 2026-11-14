import os
import shutil

import pytest

from conftest import MODERN_SITE

pw = pytest.importorskip("playwright.sync_api")
CHROME = os.environ.get("PLAYWRIGHT_CHROMIUM_PATH") or "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"
pytestmark = pytest.mark.skipif(not (os.path.exists(CHROME) or shutil.which("chromium")), reason="no chromium available")


def test_overflow_detected_and_external_requests_blocked(server, monkeypatch):
    from crm_worker.mobile import mobile_check
    monkeypatch.setenv("PLAYWRIGHT_CHROMIUM_PATH", CHROME)
    base, routes = server
    routes["/wide"] = (200, {"content-type": "text/html"}, MODERN_SITE.replace("<body>", "<body><div style='width:1200px'>wide</div>"))
    routes["/ok"] = (200, {"content-type": "text/html"}, MODERN_SITE)
    wide = mobile_check(base + "/wide", allow_private=True)
    ok = mobile_check(base + "/ok", allow_private=True)
    assert wide["tested_with"] == "playwright" and wide["horizontal_overflow"] is True
    assert ok["horizontal_overflow"] is False


def test_page_on_private_address_refused_in_production(server, monkeypatch):
    from crm_worker.mobile import mobile_check
    monkeypatch.setenv("PLAYWRIGHT_CHROMIUM_PATH", CHROME)
    base, routes = server
    routes["/ok"] = (200, {"content-type": "text/html"}, MODERN_SITE)
    r = mobile_check(base + "/ok", allow_private=False)
    assert r["tested_with"] is None  # navigation aborted by the SSRF route filter


def test_no_viewport_page_not_double_counted(server, monkeypatch):
    from conftest import OLD_SITE
    from crm_worker.mobile import mobile_check
    monkeypatch.setenv("PLAYWRIGHT_CHROMIUM_PATH", CHROME)
    base, routes = server
    routes["/old"] = (200, {"content-type": "text/html"}, OLD_SITE)
    r = mobile_check(base + "/old", allow_private=True)
    assert r["tested_with"] == "playwright" and r["horizontal_overflow"] is None

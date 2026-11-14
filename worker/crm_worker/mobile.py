"""Optional real-browser mobile check with Playwright (AUDIT_USE_PLAYWRIGHT=1).

Loads the page at 390x844 and reports whether it scrolls horizontally. Every request
the page makes is checked by the same SSRF rules; non-public targets are aborted.
"""
from __future__ import annotations

import os
from typing import Optional
from urllib.parse import urlsplit

from .safe_fetch import UnsafeTarget, check_url, resolve_public


def playwright_enabled() -> bool:
    return os.environ.get("AUDIT_USE_PLAYWRIGHT", "").lower() in ("1", "true", "yes")


def mobile_check(url: str, allow_private: bool = False, timeout_ms: int = 20000) -> Optional[dict]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"tested_with": None, "horizontal_overflow": None, "error": "playwright not installed"}

    cache: dict[str, bool] = {}

    def allowed(u: str) -> bool:
        p = urlsplit(u)
        if p.scheme in ("data", "blob", "about"):
            return True
        try:
            check_url(u, allow_private)
            host = p.hostname or ""
            if host not in cache:
                resolve_public(host, p.port or (443 if p.scheme == "https" else 80), allow_private)
                cache[host] = True
            return True
        except Exception:  # UnsafeTarget, DNS errors
            cache[p.hostname or ""] = False
            return False

    exe = os.environ.get("PLAYWRIGHT_CHROMIUM_PATH") or None
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=exe, args=["--no-sandbox"])
        try:
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1, is_mobile=True,
                                      user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
                                      service_workers="block")
            page = ctx.new_page()
            page.route("**/*", lambda route: route.continue_() if allowed(route.request.url) else route.abort())
            page.goto(url, wait_until="load", timeout=timeout_ms)
            page.wait_for_timeout(800)
            # compare with the device width (390), not innerWidth: mobile Chrome zooms out to fit wide pages
            # without a viewport tag the page is a shrunken desktop page — already reported as has_viewport=false
            sw, has_vp = page.evaluate("[document.documentElement.scrollWidth, !!document.querySelector('meta[name=viewport]')]")
            return {"tested_with": "playwright", "horizontal_overflow": bool(sw > 390 + 8) if has_vp else None, "screenshot_taken": False}
        except UnsafeTarget:
            return {"tested_with": None, "horizontal_overflow": None, "error": "unsafe target"}
        except Exception as e:  # page errors are not fatal for the audit
            return {"tested_with": None, "horizontal_overflow": None, "error": str(e)[:200]}
        finally:
            browser.close()

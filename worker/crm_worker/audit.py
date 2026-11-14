"""Audit one business: fetch the homepage safely, extract facts, optionally run
PageSpeed and a Playwright mobile check. Returns (facts, pagespeed_calls)."""
from __future__ import annotations

import datetime as dt
from typing import Callable, Optional
from urllib.parse import urlsplit

from . import mobile as mobile_mod
from .extract import extract_facts
from .pagespeed import run_pagespeed
from .presence import check_presence
from .safe_fetch import FetchResult, fetch, make_client

# Pages the CRM classifies from the URL alone (SOCIAL_ONLY / DIRECTORY_ONLY): we do not
# crawl social networks or directories.
NO_FETCH = ("facebook.com", "fb.com", "instagram.com", "tiktok.com", "linkedin.com", "twitter.com", "x.com", "youtube.com",
            "linktr.ee", "checkatrade.com", "yell.com", "mybuilder.com", "trustatrader.com", "ratedpeople.com", "bark.com",
            "yelp.co.uk", "yelp.com", "nextdoor.co.uk", "nextdoor.com", "google.com", "g.page", "maps.app.goo.gl")


def _skip(url: str) -> bool:
    h = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    return any(h == d or h.endswith("." + d) for d in NO_FETCH)


def normalise_url(url: str) -> str:
    url = url.strip()
    if "://" not in url:
        url = "https://" + url
    return url


def audit_business(business: dict, *, allow_private: bool = False, pagespeed_key: Optional[str] = None,
                   use_playwright: Optional[bool] = None, fetcher: Optional[Callable[[str], FetchResult]] = None,
                   pagespeed: Callable[..., dict] = run_pagespeed, now: Optional[dt.datetime] = None) -> tuple[dict, int]:
    now = now or dt.datetime.now(dt.timezone.utc)
    client = None
    if fetcher is None:
        client = make_client(allow_private)
        fetcher = lambda u: fetch(u, client=client, allow_private=allow_private)  # noqa: E731
    try:
        url = business.get("website_url")
        if not url:
            presence = check_presence(business.get("name") or "", business.get("city"), business.get("phone"), fetcher)
            if not presence["found_url"]:
                return {"reachable": False, "presence": presence}, 0
            # the CRM saves the found URL and queues a full audit of it
            return {"reachable": False, "presence": presence}, 0

        url = normalise_url(url)
        if _skip(url):
            return {"checked_url": url, "reachable": False, "error_kind": None}, 0

        r = fetcher(url)
        if r.error_kind == "ssl" and url.startswith("https://"):
            # certificate problems: check whether the plain-http version works (it then counts as "no HTTPS")
            r2 = fetcher("http://" + url[len("https://"):])
            if r2.ok:
                r = r2
        facts: dict = {"checked_url": url, "final_url": r.final_url, "http_status": r.status, "load_ms": r.elapsed_ms}
        if not r.ok:
            facts.update({"reachable": False, "error_kind": r.error_kind or "http_error"})
            return facts, 0
        ctype = r.headers.get("content-type", "")
        if ctype and "html" not in ctype and "xml" not in ctype:
            facts.update({"reachable": False, "error_kind": "http_error"})
            return facts, 0

        final = r.final_url or url
        facts["reachable"] = True
        facts["https"] = final.startswith("https://")
        facts.update(extract_facts(r.text, final, business.get("city"), current_year=now.year))

        calls = 0
        ps = pagespeed(final, api_key=pagespeed_key)
        if ps.get("error") != "PAGESPEED_API_KEY not set":
            calls = 1
        facts["pagespeed"] = ps

        use_pw = mobile_mod.playwright_enabled() if use_playwright is None else use_playwright
        if use_pw:
            facts["mobile"] = mobile_mod.mobile_check(final, allow_private=allow_private)
        return facts, calls
    finally:
        if client is not None:
            client.close()

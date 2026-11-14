"""Google PageSpeed Insights (v5) — mobile strategy. Needs PAGESPEED_API_KEY.

Without a key the result is {"fetched": False, "error": "PAGESPEED_API_KEY not set"}
so the CRM shows speed as "not verified" instead of a made-up number.
"""
from __future__ import annotations

import os
from typing import Optional

import httpx

PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


def run_pagespeed(url: str, api_key: Optional[str] = None, client: Optional[httpx.Client] = None, timeout: float = 70.0) -> dict:
    key = api_key if api_key is not None else os.environ.get("PAGESPEED_API_KEY", "")
    if not key:
        return {"fetched": False, "strategy": "mobile", "error": "PAGESPEED_API_KEY not set"}
    params = [("url", url), ("strategy", "mobile"), ("key", key)] + [("category", c) for c in ("performance", "accessibility", "seo", "best-practices")]
    own = client is None
    client = client or httpx.Client(timeout=timeout)
    try:
        r = client.get(PSI_URL, params=params)
        if r.status_code != 200:
            try:
                msg = r.json().get("error", {}).get("message", "")
            except ValueError:
                msg = r.text[:200]
            return {"fetched": False, "strategy": "mobile", "error": f"HTTP {r.status_code}: {msg.replace(key, '***')[:200]}"}
        return parse_pagespeed(r.json())
    except httpx.HTTPError as e:
        msg = (str(e) or e.__class__.__name__).replace(key, "***")
        return {"fetched": False, "strategy": "mobile", "error": msg[:200]}
    finally:
        if own:
            client.close()


def parse_pagespeed(data: dict) -> dict:
    lh = data.get("lighthouseResult") or {}
    cats = lh.get("categories") or {}
    audits = lh.get("audits") or {}

    def score(k: str) -> Optional[int]:
        s = (cats.get(k) or {}).get("score")
        return round(s * 100) if isinstance(s, (int, float)) else None

    def num(k: str) -> Optional[float]:
        v = (audits.get(k) or {}).get("numericValue")
        return v if isinstance(v, (int, float)) else None

    lcp = num("largest-contentful-paint")
    cls = num("cumulative-layout-shift")
    return {
        "fetched": score("performance") is not None,
        "strategy": "mobile",
        "performance": score("performance"),
        "accessibility": score("accessibility"),
        "seo": score("seo"),
        "best_practices": score("best-practices"),
        "lcp_ms": round(lcp) if lcp is not None else None,
        "cls": round(cls, 3) if cls is not None else None,
        "error": None if score("performance") is not None else "no performance score in response",
    }

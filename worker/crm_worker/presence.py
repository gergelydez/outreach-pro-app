"""For businesses without a website on their Google profile: check a few likely
domains. A domain only counts as theirs if its homepage shows the business phone
number or (most of) the business name — a parked page or a namesake elsewhere does not.
"""
from __future__ import annotations

import re
from typing import Callable, Optional

from .safe_fetch import FetchResult

STOP = {"ltd", "limited", "the", "and", "co", "uk", "services", "service", "of", "plc", "llp", "group"}
PARKED = ("domain is for sale", "buy this domain", "this domain may be for sale", "parked free", "domain parking", "is parked",
          "future home of", "website coming soon", "under construction")


def _tokens(name: str) -> list[str]:
    return [t for t in re.sub(r"[^a-z0-9 ]+", " ", name.lower().replace("&", " and ")).split() if t and t not in STOP]


def candidate_domains(name: str, city: Optional[str] = None, limit: int = 6) -> list[str]:
    toks = _tokens(name)
    if not toks:
        return []
    joined = "".join(toks)
    hyph = "-".join(toks)
    city_t = re.sub(r"[^a-z0-9]+", "", (city or "").lower())
    cands = [f"{joined}.co.uk", f"{joined}.com", f"{hyph}.co.uk", f"{joined}.uk"]
    if city_t and city_t not in joined:
        cands += [f"{joined}{city_t}.co.uk", f"{toks[0]}{city_t}.co.uk"]
    out: list[str] = []
    for c in cands:
        if 4 < len(c) <= 63 + 6 and c not in out:
            out.append(c)
    return out[:limit]


def page_matches_business(html: str, name: str, phone: Optional[str]) -> bool:
    low = html.lower()
    if any(p in low for p in PARKED):
        return False
    digits = re.sub(r"\D", "", low)
    if phone:
        p = re.sub(r"\D", "", phone)
        if p.startswith("44"):
            p = "0" + p[2:]
        if len(p) >= 10 and (p in digits or p[1:] in digits):
            return True
    toks = [t for t in _tokens(name) if len(t) > 2]
    if not toks:
        return False
    text = re.sub(r"[^a-z0-9 ]+", " ", low)
    hits = sum(1 for t in toks if re.search(rf"\b{re.escape(t)}\b", text))
    return hits >= max(2, round(len(toks) * 0.75)) if len(toks) > 1 else hits == 1 and len(toks[0]) >= 5


def check_presence(name: str, city: Optional[str], phone: Optional[str], fetcher: Callable[[str], FetchResult]) -> dict:
    cands = candidate_domains(name, city)
    found = None
    for d in cands:
        for url in (f"https://{d}/", f"https://www.{d}/"):
            r = fetcher(url)
            if r.ok and page_matches_business(r.text, name, phone):
                found = r.final_url or url
                break
            if r.error_kind == "dns":
                break  # www. will not resolve either in practice; move on
        if found:
            break
    return {"checked": True, "candidates": cands, "found_url": found}

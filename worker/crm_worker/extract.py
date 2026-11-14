"""Turn a fetched homepage into observed facts (see lib/crm/audit-types.ts AuditFacts).

Only facts that are visible in the HTML are reported. Nothing is guessed: when
something cannot be determined the key is left out or set to None.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Optional
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

UK_PHONE_RE = re.compile(r"(?<![\d+])(?:\+44\s?\(?0?\)?\s?\d{2,4}|\(?0\d{2,4}\)?)[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}(?!\d)")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
POSTCODE_RE = re.compile(r"\b(GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b", re.I)
COPYRIGHT_RE = re.compile(r"(?:©|&copy;|\(c\)|copyright)\s*(?:[^\d]{0,40}?)((?:19|20)\d{2})(?:\s*[-–—/]\s*((?:19|20)\d{2}))?", re.I)
CTA_RE = re.compile(r"\b(get (?:a |your )?(?:free )?quote|free quote|request (?:a )?quote|call (?:us|now|today)|book (?:now|online|a)|contact us|get in touch|"
                    r"free estimate|request (?:a )?callback|enquire|enquiry|message us|whatsapp us)\b", re.I)
SERVICE_WORDS = ("service", "plumb", "electric", "boiler", "heating", "repair", "install", "roof", "build", "extension", "kitchen",
                 "bathroom", "clean", "garden", "landscap", "lock", "paint", "decorat", "plaster", "carpent", "rewir", "emergency")
LOCAL_BUSINESS_TYPES = ("LocalBusiness", "HomeAndConstructionBusiness", "Plumber", "Electrician", "HVACBusiness", "RoofingContractor",
                        "GeneralContractor", "HousePainter", "Locksmith", "MovingCompany", "ProfessionalService", "CleaningService")
EMAIL_IGNORE = ("example.com", "sentry.io", "wixpress.com", "domain.com", "email.com", "yourdomain", "sentry-next.wixpress.com")


def _clean_phone(s: str) -> Optional[str]:
    digits = re.sub(r"[^\d+]", "", s)
    if digits.startswith("+44"):
        digits = "0" + digits[3:].lstrip("0")
    if not digits.startswith("0") or not (10 <= len(digits) <= 11):
        return None
    return digits


def detect_old_tech(html: str, soup: BeautifulSoup, generator: Optional[str]) -> list[str]:
    out: list[str] = []
    low = html.lower()
    m = re.search(r"jquery[.-]?(1\.\d+(?:\.\d+)?)(?:\.min)?\.js", low)
    if m:
        out.append(f"jQuery {m.group(1)}")
    if ".swf" in low or "application/x-shockwave-flash" in low:
        out.append("Adobe Flash")
    if soup.find(["frameset", "frame"]):
        out.append("HTML frames")
    if soup.find("marquee") or soup.find("blink"):
        out.append("<marquee>/<blink> tags")
    if len(soup.find_all("font")) >= 3:
        out.append("<font> tags")
    if re.search(r"<!--\[if (lt )?ie [5-8]", low):
        out.append("Internet Explorer conditional comments")
    if generator:
        g = generator.lower()
        wp = re.search(r"wordpress\s+(\d+)\.", g)
        if wp and int(wp.group(1)) < 5:
            out.append(generator)
        if re.search(r"joomla!?\s*1\.", g) or "frontpage" in g or "dreamweaver" in g or "iweb" in g:
            out.append(generator)
    return out


def _uses_table_layout(soup: BeautifulSoup) -> bool:
    # tables that wrap most of the page (nested tables with images/navigation), not data tables
    tables = soup.find_all("table")
    if not tables:
        return False
    body = soup.body
    if not body:
        return False
    top = [t for t in tables if not t.find_parent("table")]
    for t in top:
        if t.find("table") and (t.find("img") or t.find("a")):
            return True
        if t.get("width") in ("100%", "800", "760", "780", "960", "1000") and len(t.get_text(" ", strip=True)) > 400:
            return True
    return False


def _ld_json_types(soup: BeautifulSoup) -> list[str]:
    types: list[str] = []

    def walk(o):
        if isinstance(o, dict):
            t = o.get("@type")
            if isinstance(t, str):
                types.append(t)
            elif isinstance(t, list):
                types.extend(x for x in t if isinstance(x, str))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    for s in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            walk(json.loads(s.string or s.get_text() or "{}"))
        except (ValueError, TypeError):
            continue
    return types


def extract_facts(html: str, base_url: str, city: Optional[str] = None, current_year: Optional[int] = None) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    facts: dict = {}

    vp = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)})
    facts["has_viewport"] = bool(vp and "width" in (vp.get("content") or "").lower())
    facts["title"] = (soup.title.get_text(strip=True)[:200] if soup.title else None) or None
    md = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
    facts["meta_description"] = ((md.get("content") or "").strip()[:300] if md else "") or None
    gen = soup.find("meta", attrs={"name": re.compile(r"^generator$", re.I)})
    generator = (gen.get("content") or "").strip()[:100] if gen else None
    facts["generator"] = generator or None

    facts["h1_count"] = len(soup.find_all("h1"))
    facts["headings"] = [h.get_text(" ", strip=True)[:120] for h in soup.find_all(["h1", "h2"])][:12]

    # visible text (scripts/styles removed) — kept for the checks below
    for t in soup(["script", "style", "noscript", "template"]):
        if t.get("type") != "application/ld+json":
            t.decompose()
    text = soup.get_text(" ", strip=True)

    links = soup.find_all("a", href=True)
    tel = [a["href"] for a in links if a["href"].lower().startswith("tel:")]
    mailto = [a["href"] for a in links if a["href"].lower().startswith("mailto:")]
    facts["tel_links"] = len(tel)
    facts["mailto_links"] = len(mailto)

    phones: list[str] = []
    for raw in [h[4:] for h in tel] + UK_PHONE_RE.findall(text):
        p = _clean_phone(raw)
        if p and p not in phones:
            phones.append(p)
    facts["phones"] = phones[:5]

    emails: list[str] = []
    for raw in [m[7:].split("?")[0] for m in mailto] + EMAIL_RE.findall(text):
        e = raw.strip().strip(".").lower()
        if not EMAIL_RE.fullmatch(e) or any(x in e for x in EMAIL_IGNORE) or re.search(r"\.(png|jpe?g|gif|webp|svg)$", e):
            continue
        if e not in emails:
            emails.append(e)
    facts["emails"] = emails[:5]

    wa: list[str] = []
    raw_html_low = html.lower()
    for a in links:
        h = a["href"].strip()
        hl = h.lower()
        if "wa.me/" in hl or "api.whatsapp.com/send" in hl or "web.whatsapp.com/send" in hl or hl.startswith("whatsapp://send"):
            if h not in wa:
                wa.append(h[:200])
    facts["whatsapp_links"] = wa[:5]
    facts["whatsapp_widget"] = any(k in raw_html_low for k in ("elfsight-app", "whatsapp-widget", "wa-widget", "joinchat", "getbutton.io", "click-to-chat", "wati.io"))

    forms = soup.find_all("form")
    facts["forms"] = len(forms)
    contact = False
    for f in forms:
        role = " ".join([f.get("id") or "", " ".join(f.get("class") or []), f.get("action") or "", f.get("role") or ""]).lower()
        if "search" in role and not f.find("textarea"):
            continue
        if f.find("textarea") or f.find("input", attrs={"type": re.compile("email|tel", re.I)}) or re.search(r"contact|quote|enquir", role):
            contact = True
            break
    facts["contact_form"] = contact

    ctas: list[str] = []
    for el in soup.find_all(["a", "button"]):
        t = el.get_text(" ", strip=True)
        if t and len(t) <= 60 and CTA_RE.search(t) and t not in ctas:
            ctas.append(t)
    facts["cta_texts"] = ctas[:8]
    facts["has_cta"] = bool(ctas) or len(tel) > 0

    city_l = (city or "").strip().lower()
    types = _ld_json_types(soup)
    facts["local_seo"] = {
        "mentions_city": bool(city_l) and city_l in text.lower(),
        "has_postcode": bool(POSTCODE_RE.search(text)),
        "local_business_schema": any(t in LOCAL_BUSINESS_TYPES for t in types),
    }

    years: list[int] = []
    for m in COPYRIGHT_RE.finditer(text):
        years += [int(y) for y in m.groups() if y]
    if current_year:
        years = [y for y in years if 1995 <= y <= current_year + 1]
    facts["copyright_year"] = max(years) if years else None

    facts["old_tech"] = detect_old_tech(html, soup, generator)
    facts["table_layout"] = _uses_table_layout(soup)
    facts["page_kb"] = round(len(html.encode("utf-8", errors="ignore")) / 1024, 1)

    host = (urlsplit(base_url).hostname or "").lower().removeprefix("www.")
    nav_set = set()
    for nav in soup.find_all(["nav", "header"]):
        nav_set.update(id(a) for a in nav.find_all("a", href=True))
    facts["nav_links"] = len(nav_set)
    service = set()
    for a in links:
        href = urljoin(base_url, a["href"])
        h = (urlsplit(href).hostname or "").lower().removeprefix("www.")
        label = (a.get_text(" ", strip=True) + " " + urlsplit(href).path).lower()
        if h == host and any(w in label for w in SERVICE_WORDS):
            service.add(urlsplit(href).path.rstrip("/") or label)
    facts["service_links"] = len(service)

    facts["content_hash"] = hashlib.sha256(re.sub(r"\s+", " ", text).encode()).hexdigest()
    return facts

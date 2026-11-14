import json

import httpx

from conftest import MODERN_SITE, OLD_SITE
from crm_worker.audit import audit_business
from crm_worker.main import CrmApi, process_job

NO_PS = lambda url, api_key=None: {"fetched": False, "strategy": "mobile", "error": "PAGESPEED_API_KEY not set"}  # noqa: E731


def test_audit_old_site_over_http(server):
    base, routes = server
    routes["/"] = (200, {"content-type": "text/html"}, OLD_SITE)
    facts, calls = audit_business({"name": "Kings Heath Plumbing", "city": "Birmingham", "website_url": base + "/"},
                                  allow_private=True, pagespeed=NO_PS, use_playwright=False)
    assert facts["reachable"] is True and facts["https"] is False and facts["has_viewport"] is False
    assert facts["pagespeed"]["fetched"] is False and calls == 0


def test_audit_unreachable(server):
    base, _ = server
    facts, _ = audit_business({"name": "X", "website_url": base + "/gone"}, allow_private=True, pagespeed=NO_PS, use_playwright=False)
    assert facts["reachable"] is False and facts["http_status"] == 404 and facts["error_kind"] == "http_error"


def test_audit_production_rules_block_internal_url():
    facts, _ = audit_business({"name": "X", "website_url": "http://169.254.169.254/"}, pagespeed=NO_PS, use_playwright=False)
    assert facts["reachable"] is False and facts["error_kind"] == "unsafe_target"


def test_social_url_not_fetched():
    def boom(url):
        raise AssertionError("must not fetch social sites")
    facts, _ = audit_business({"name": "X", "website_url": "https://www.facebook.com/xplumbing"}, fetcher=boom, pagespeed=NO_PS)
    assert facts["reachable"] is False


def test_process_job_posts_facts(server):
    base, routes = server
    routes["/"] = (200, {"content-type": "text/html"}, MODERN_SITE)
    posted = []

    def handler(req: httpx.Request):
        assert req.headers["authorization"] == "Bearer t0k"
        posted.append(json.loads(req.content))
        return httpx.Response(200, json={"ok": True, "status": "GOOD_WEBSITE"})

    api = CrmApi("https://crm.test", "t0k", client=httpx.Client(transport=httpx.MockTransport(handler), headers={"Authorization": "Bearer t0k"}))
    job = {"id": "11111111-1111-4111-8111-111111111111", "business": {"name": "Brummie Sparks", "city": "Birmingham", "website_url": base + "/"}}
    res = process_job(api, job, allow_private=True, pagespeed=NO_PS, use_playwright=False)
    assert res["status"] == "GOOD_WEBSITE"
    assert posted[0]["ok"] is True and posted[0]["facts"]["whatsapp_links"] == ["https://wa.me/447700900222"]


def test_process_job_reports_retryable_error():
    posted = []
    api = CrmApi("https://crm.test", "t", client=httpx.Client(transport=httpx.MockTransport(lambda r: (posted.append(json.loads(r.content)), httpx.Response(200, json={"ok": True}))[1])))

    def bad_ps(url, api_key=None):
        raise RuntimeError("boom")

    job = {"id": "j", "business": {"name": "X", "website_url": "https://example.invalid/"}}
    # fetch fails first (DNS) → facts, not an error; force an error via fetcher
    def fetcher(url):
        raise RuntimeError("parser crashed")
    process_job(api, job, fetcher=fetcher, pagespeed=bad_ps)
    assert posted[0]["ok"] is False and posted[0]["retryable"] is True and "parser crashed" in posted[0]["error"]

from crm_worker.pagespeed import parse_pagespeed, run_pagespeed
from crm_worker.presence import candidate_domains, check_presence, page_matches_business
from crm_worker.safe_fetch import FetchResult


def test_candidates():
    c = candidate_domains("Wolves Electrical Services Ltd", "Wolverhampton")
    assert c[:3] == ["wolveselectrical.co.uk", "wolveselectrical.com", "wolves-electrical.co.uk"]
    assert "wolveselectricalwolverhampton.co.uk" in c


def test_matching_requires_evidence():
    assert page_matches_business("<h1>Wolves Electrical</h1>", "Wolves Electrical Services", None)
    assert page_matches_business("Call 01902 123456", "Totally Different", "+441902123456")
    assert not page_matches_business("<h1>Wolves Rugby Club</h1>", "Wolves Electrical Services", None)
    assert not page_matches_business("Wolves Electrical — this domain is for sale", "Wolves Electrical", None)


def test_check_presence_uses_fetcher():
    seen = []

    def fetcher(url):
        seen.append(url)
        if url == "https://wolveselectrical.com/":
            return FetchResult(url=url, final_url=url, status=200, body=b"<title>Wolves Electrical Wolverhampton</title>", headers={"content-type": "text/html"})
        return FetchResult(url=url, error_kind="dns")

    r = check_presence("Wolves Electrical Services", "Wolverhampton", None, fetcher)
    assert r["found_url"] == "https://wolveselectrical.com/" and r["checked"] is True
    assert seen[0] == "https://wolveselectrical.co.uk/"


def test_pagespeed_without_key_is_not_verified():
    r = run_pagespeed("https://x.co.uk", api_key="")
    assert r == {"fetched": False, "strategy": "mobile", "error": "PAGESPEED_API_KEY not set"}


def test_parse_pagespeed():
    data = {"lighthouseResult": {"categories": {"performance": {"score": 0.28}, "accessibility": {"score": 0.71}, "seo": {"score": 0.64},
                                                "best-practices": {"score": 0.58}},
                                 "audits": {"largest-contentful-paint": {"numericValue": 6912.4}, "cumulative-layout-shift": {"numericValue": 0.21}}}}
    assert parse_pagespeed(data) == {"fetched": True, "strategy": "mobile", "performance": 28, "accessibility": 71, "seo": 64,
                                     "best_practices": 58, "lcp_ms": 6912, "cls": 0.21, "error": None}


def test_pagespeed_error_never_contains_key():
    import httpx

    def handler(req):
        assert req.url.params["key"] == "SECRETKEY" and req.url.params["strategy"] == "mobile"
        return httpx.Response(400, json={"error": {"message": "Bad key SECRETKEY"}})
    r = run_pagespeed("https://x.co.uk", api_key="SECRETKEY", client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert r["fetched"] is False and "SECRETKEY" not in r["error"]

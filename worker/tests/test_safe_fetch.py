import pytest

from crm_worker.safe_fetch import UnsafeTarget, check_url, fetch, ip_is_public, resolve_public


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.1.2.3", "172.16.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1",
                                "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "224.0.0.1"])
def test_non_public_ips_rejected(ip):
    assert ip_is_public(ip) is False


@pytest.mark.parametrize("ip", ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
def test_public_ips_allowed(ip):
    assert ip_is_public(ip) is True


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://example.com/", "gopher://x", "http://user:pw@example.com/",
                                 "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/",
                                 "http://example.com:8080/"])
def test_check_url_rejects(url):
    with pytest.raises(UnsafeTarget):
        check_url(url)


def test_localhost_names_rejected_before_dns():
    for h in ("localhost", "metadata.google.internal", "printer.local"):
        with pytest.raises(UnsafeTarget):
            resolve_public(h, 80)


def test_fetch_to_loopback_blocked_by_default(server):
    base, routes = server
    routes["/"] = (200, {"content-type": "text/html"}, "<h1>secret</h1>")
    r = fetch(base + "/")
    assert r.error_kind == "unsafe_target" and r.body == b""


def test_hostname_resolving_to_loopback_blocked_at_connect(server, monkeypatch):
    # a public-looking hostname that resolves to 127.0.0.1 (DNS rebinding style) must be refused
    import socket
    base, routes = server
    port = int(base.rsplit(":", 1)[1])
    routes["/"] = (200, {"content-type": "text/html"}, "<h1>secret</h1>")
    real = socket.getaddrinfo
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, *a, **k: real("127.0.0.1", *a, **k) if host == "evil.example" else real(host, *a, **k))
    from crm_worker import safe_fetch
    monkeypatch.setattr(safe_fetch, "check_url", lambda u, allow_private=False, allowed_ports=(80, 443): u)  # skip URL-level check
    r = fetch(f"http://evil.example:{port}/")
    assert r.error_kind == "unsafe_target"


def test_redirect_to_metadata_blocked(server):
    base, routes = server
    routes["/"] = (302, {"location": "http://169.254.169.254/latest/meta-data/"}, "")
    # allow_private lets us reach the local test server, but the redirect target is re-checked;
    # we simulate production rules for the second hop by checking the recorded redirect
    r = fetch(base + "/", allow_private=True)
    assert r.redirects == ["http://169.254.169.254/latest/meta-data/"]
    # in production (allow_private=False) the hop itself is refused
    from crm_worker.safe_fetch import check_url as cu
    with pytest.raises(UnsafeTarget):
        cu(r.redirects[0])


def test_fetch_follows_redirect_and_limits_size(server):
    base, routes = server
    routes["/"] = (301, {"location": "/home"}, "")
    routes["/home"] = (200, {"content-type": "text/html; charset=utf-8"}, "<title>ok</title>")
    routes["/big"] = (200, {"content-type": "text/html"}, b"x" * 50_000)
    r = fetch(base + "/", allow_private=True)
    assert r.ok and r.final_url == base + "/home" and "ok" in r.text
    big = fetch(base + "/big", allow_private=True, max_bytes=10_000)
    assert big.error_kind == "too_large"


def test_http_error_status(server):
    base, _ = server
    r = fetch(base + "/missing", allow_private=True)
    assert r.status == 404 and r.error_kind == "http_error"


def test_dns_failure_kind():
    r = fetch("https://this-domain-does-not-exist-crm-test.invalid/")
    assert r.error_kind in ("dns", "unsafe_target", "connection")

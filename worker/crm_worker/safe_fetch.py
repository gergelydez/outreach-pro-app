"""SSRF-safe HTTP fetching.

Protections:
- only http/https, only ports 80/443 (plus explicit allow for tests)
- every hostname is resolved and EVERY resulting address must be public
  (no private, loopback, link-local, multicast, reserved, CGNAT, metadata ranges)
- the check happens at connect time inside a custom network backend, so the address
  that is validated is the address that is connected to (no DNS-rebinding gap)
- redirects are followed manually (max 5) and each hop is re-validated
- response size and total time are capped; environment proxies are ignored
"""
from __future__ import annotations

import ipaddress
import socket
import time
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urljoin, urlsplit

import httpcore
import httpx

MAX_BYTES = 3 * 1024 * 1024
MAX_REDIRECTS = 5
USER_AGENT = "Mozilla/5.0 (compatible; LocalWebsiteAudit/1.0; one-off public homepage check)"

_BLOCKED_NETS = [ipaddress.ip_network(n) for n in (
    "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
    "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24",
    "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "255.255.255.255/32",
    "::/128", "::1/128", "::ffff:0:0/96", "64:ff9b::/96", "100::/64", "2001:db8::/32", "fc00::/7", "fe80::/10", "ff00::/8",
)]


class UnsafeTarget(Exception):
    """Raised when a URL or resolved address is not allowed."""


def ip_is_public(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        return ip_is_public(str(addr.ipv4_mapped))
    if any(addr in n for n in _BLOCKED_NETS):
        return False
    return addr.is_global and not (addr.is_private or addr.is_loopback or addr.is_link_local
                                   or addr.is_multicast or addr.is_reserved or addr.is_unspecified)


def resolve_public(host: str, port: int, allow_private: bool = False) -> list[tuple]:
    """Resolve host and return addrinfo tuples; raise if any address is not public."""
    if not host:
        raise UnsafeTarget("empty host")
    h = host.strip("[]").lower()
    if h in ("localhost",) or h.endswith(".localhost") or h.endswith(".internal") or h.endswith(".local"):
        if not allow_private:
            raise UnsafeTarget(f"internal hostname {host}")
    try:
        infos = socket.getaddrinfo(h, port, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise httpcore.ConnectError(f"dns: {e}") from e
    if not infos:
        raise httpcore.ConnectError("dns: no addresses")
    if not allow_private:
        bad = [i[4][0] for i in infos if not ip_is_public(i[4][0])]
        if bad:
            raise UnsafeTarget(f"{host} resolves to non-public address {bad[0]}")
    return infos


class SafeBackend(httpcore.SyncBackend):
    """Network backend that validates the resolved address right before connecting."""

    def __init__(self, allow_private: bool = False):
        super().__init__()
        self.allow_private = allow_private

    def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        infos = resolve_public(host, port, self.allow_private)
        last: Optional[Exception] = None
        for family, _type, proto, _canon, sockaddr in infos:
            ip = sockaddr[0]
            try:
                return super().connect_tcp(ip, port, timeout=timeout, local_address=local_address,
                                           socket_options=socket_options)
            except Exception as e:  # try the next address
                last = e
        raise last or httpcore.ConnectError("could not connect")


def check_url(url: str, allow_private: bool = False, allowed_ports: tuple = (80, 443)) -> str:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise UnsafeTarget(f"scheme not allowed: {parts.scheme or '(none)'}")
    if not parts.hostname:
        raise UnsafeTarget("missing host")
    if parts.username or parts.password:
        raise UnsafeTarget("credentials in URL not allowed")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if port not in allowed_ports and not allow_private:
        raise UnsafeTarget(f"port not allowed: {port}")
    host = parts.hostname
    try:  # literal IPs are checked directly
        ipaddress.ip_address(host)
        if not allow_private and not ip_is_public(host):
            raise UnsafeTarget(f"non-public IP {host}")
    except ValueError:
        pass
    return url


def make_client(allow_private: bool = False, timeout: float = 15.0) -> httpx.Client:
    transport = httpx.HTTPTransport(retries=0)
    # httpx does not expose the network backend publicly; set it on the underlying pool.
    transport._pool._network_backend = SafeBackend(allow_private)  # noqa: SLF001
    return httpx.Client(transport=transport, timeout=httpx.Timeout(timeout, connect=8.0), follow_redirects=False,
                        trust_env=False, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
                                                  "Accept-Language": "en-GB,en;q=0.8"})


@dataclass
class FetchResult:
    url: str
    final_url: Optional[str] = None
    status: Optional[int] = None
    body: bytes = b""
    headers: dict = field(default_factory=dict)
    error_kind: Optional[str] = None
    error: Optional[str] = None
    elapsed_ms: int = 0
    redirects: list = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.error_kind is None and self.status is not None and 200 <= self.status < 400

    @property
    def text(self) -> str:
        ctype = self.headers.get("content-type", "")
        enc = "utf-8"
        if "charset=" in ctype:
            enc = ctype.split("charset=")[-1].split(";")[0].strip() or "utf-8"
        try:
            return self.body.decode(enc, errors="replace")
        except LookupError:
            return self.body.decode("utf-8", errors="replace")


def fetch(url: str, client: Optional[httpx.Client] = None, allow_private: bool = False,
          max_bytes: int = MAX_BYTES, total_timeout: float = 25.0, method: str = "GET") -> FetchResult:
    own = client is None
    client = client or make_client(allow_private)
    res = FetchResult(url=url)
    start = time.monotonic()
    current = url
    try:
        for hop in range(MAX_REDIRECTS + 1):
            try:
                check_url(current, allow_private)
            except UnsafeTarget as e:
                res.error_kind, res.error = "unsafe_target", str(e)
                return res
            if time.monotonic() - start > total_timeout:
                res.error_kind, res.error = "timeout", "total time limit"
                return res
            try:
                with client.stream(method, current) as r:
                    res.status = r.status_code
                    res.headers = {k.lower(): v for k, v in r.headers.items()}
                    if r.is_redirect and "location" in r.headers:
                        nxt = urljoin(current, r.headers["location"])
                        res.redirects.append(nxt)
                        current = nxt
                        continue
                    buf = bytearray()
                    for chunk in r.iter_bytes():
                        buf.extend(chunk)
                        if len(buf) > max_bytes:
                            res.error_kind, res.error = "too_large", f"over {max_bytes} bytes"
                            break
                        if time.monotonic() - start > total_timeout:
                            res.error_kind, res.error = "timeout", "total time limit"
                            break
                    res.body = bytes(buf)
                    res.final_url = current
                    if res.error_kind is None and r.status_code >= 400:
                        res.error_kind = "http_error"
                    return res
            except UnsafeTarget as e:
                res.error_kind, res.error = "unsafe_target", str(e)
                return res
        res.error_kind, res.error = "connection", "too many redirects"
        return res
    except httpx.TimeoutException as e:
        res.error_kind, res.error = "timeout", str(e) or "timeout"
    except httpx.ConnectError as e:
        msg = str(e)
        if "dns" in msg.lower() or "name or service" in msg.lower() or "nodename" in msg.lower():
            res.error_kind = "dns"
        elif "ssl" in msg.lower() or "certificate" in msg.lower():
            res.error_kind = "ssl"
        else:
            res.error_kind = "connection"
        res.error = msg
    except httpx.HTTPError as e:
        msg = str(e)
        res.error_kind = "ssl" if ("ssl" in msg.lower() or "certificate" in msg.lower()) else "connection"
        res.error = msg or e.__class__.__name__
    finally:
        res.elapsed_ms = int((time.monotonic() - start) * 1000)
        if own:
            client.close()
    return res

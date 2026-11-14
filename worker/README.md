# CRM audit worker (Python)

Visits the public homepage of each lead, records **observed facts** (HTTPS, mobile viewport,
contact form, calls to action, phone/email/WhatsApp links, copyright year, legacy tech, local SEO
signals), optionally runs **Google PageSpeed Insights (mobile)** and a **Playwright** 390px phone
check, then reports to the CRM. Classification and scoring are done by the CRM, not here.

It talks to the CRM only over HTTPS with a token — it never gets database credentials:

```
POST {CRM_API_URL}/api/crm/worker/claim   → jobs (url, name, city, phone)
POST {CRM_API_URL}/api/crm/worker/result  → facts or a retryable error
```

## Run locally

```bash
cd worker
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
playwright install chromium          # only if AUDIT_USE_PLAYWRIGHT=1
export CRM_API_URL=https://your-app.vercel.app
export CRM_WORKER_TOKEN=...          # same value as in Vercel
export PAGESPEED_API_KEY=...         # optional
export AUDIT_USE_PLAYWRIGHT=1        # optional
python -m crm_worker                 # loops; --once processes one batch and exits
```

## Docker

```bash
docker build -t crm-worker worker
docker run -e CRM_API_URL=... -e CRM_WORKER_TOKEN=... -e PAGESPEED_API_KEY=... crm-worker
```

## Environment

| Variable | Required | Notes |
|---|---|---|
| `CRM_API_URL` | yes | Base URL of the Next.js app |
| `CRM_WORKER_TOKEN` | yes | Shared secret, same as the app |
| `PAGESPEED_API_KEY` | no | Without it, speed is shown as "not verified" |
| `AUDIT_USE_PLAYWRIGHT` | no | `1` = real-browser mobile overflow check |
| `PLAYWRIGHT_CHROMIUM_PATH` | no | Custom Chromium binary |
| `WORKER_POLL_SECONDS` | no | Poll interval, default 30 s; doubles while the queue is empty (max 10 min) |
| `WORKER_BATCH` | no | Jobs per claim (1–10), default 3 |
| `AUDIT_ALLOW_PRIVATE_TARGETS` | **never in production** | Lets tests reach 127.0.0.1 |

## Safety (SSRF)

- Only `http`/`https` on ports 80/443; no credentials in URLs.
- Every hostname is resolved and **every** address must be public (private, loopback, link-local,
  CGNAT, cloud metadata `169.254.169.254`, IPv6 ULA/link-local, IPv4-mapped are refused).
- The check runs inside the connection itself (custom network backend), so the address validated
  is the address connected to — no DNS-rebinding gap. Redirects are followed manually and each hop
  is re-checked. Bodies are capped at 3 MB, total time at 25 s, environment proxies are ignored.
- The Playwright check routes every browser request through the same rules.
- Social networks and directories are never crawled — the CRM classifies them from the URL.
- The PageSpeed key is never logged (httpx request logging is silenced and errors are redacted).

## Tests

```bash
pip install -r requirements-dev.txt
pytest -q
```

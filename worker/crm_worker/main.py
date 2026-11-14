"""Worker loop: claim jobs from the CRM API, audit, report results.

Environment:
  CRM_API_URL        e.g. https://your-app.vercel.app (no trailing slash)
  CRM_WORKER_TOKEN   same value as CRM_WORKER_TOKEN in the Next.js app
  PAGESPEED_API_KEY  optional; without it speed is reported as "not verified"
  AUDIT_USE_PLAYWRIGHT=1  optional real-browser mobile check
  WORKER_POLL_SECONDS (default 30), WORKER_BATCH (default 3), WORKER_ID
  AUDIT_ALLOW_PRIVATE_TARGETS=1  ONLY for local tests against 127.0.0.1 — never in production
"""
from __future__ import annotations

import argparse
import logging
import os
import signal
import socket
import sys
import time

import httpx

from .audit import audit_business

log = logging.getLogger("crm_worker")
_stop = False


def _handle_stop(*_):
    global _stop
    _stop = True


class CrmApi:
    def __init__(self, base: str, token: str, client: httpx.Client | None = None):
        self.base = base.rstrip("/")
        self.client = client or httpx.Client(timeout=40.0, headers={"Authorization": f"Bearer {token}"})

    def claim(self, worker_id: str, limit: int) -> list[dict]:
        r = self.client.post(f"{self.base}/api/crm/worker/claim", json={"worker_id": worker_id, "limit": limit})
        r.raise_for_status()
        return r.json().get("jobs", [])

    def result(self, payload: dict) -> dict:
        r = self.client.post(f"{self.base}/api/crm/worker/result", json=payload)
        r.raise_for_status()
        return r.json()


def process_job(api: CrmApi, job: dict, **audit_kw) -> dict:
    biz = job.get("business")
    if not biz:
        return api.result({"job_id": job["id"], "ok": False, "error": "business not found", "retryable": False})
    try:
        facts, calls = audit_business(biz, **audit_kw)
    except Exception as e:  # processing bug → retry with backoff on the server
        log.exception("audit failed for job %s", job["id"])
        return api.result({"job_id": job["id"], "ok": False, "error": f"{e.__class__.__name__}: {e}"[:900], "retryable": True})
    return api.result({"job_id": job["id"], "ok": True, "facts": facts, "pagespeed_calls": calls})


def run(once: bool = False) -> int:
    base = os.environ.get("CRM_API_URL", "").strip()
    token = os.environ.get("CRM_WORKER_TOKEN", "").strip()
    if not base or not token:
        print("CRM_API_URL and CRM_WORKER_TOKEN must be set", file=sys.stderr)
        return 2
    worker_id = os.environ.get("WORKER_ID") or f"py-{socket.gethostname()}"[:80]
    poll = max(5, int(os.environ.get("WORKER_POLL_SECONDS", "30")))
    batch = max(1, min(10, int(os.environ.get("WORKER_BATCH", "3"))))
    allow_private = os.environ.get("AUDIT_ALLOW_PRIVATE_TARGETS", "") == "1"
    if allow_private:
        log.warning("AUDIT_ALLOW_PRIVATE_TARGETS=1 — SSRF protection relaxed (local testing only)")
    api = CrmApi(base, token)
    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)
    failures = 0
    while not _stop:
        try:
            jobs = api.claim(worker_id, batch)
            failures = 0
        except httpx.HTTPError as e:
            failures += 1
            wait = min(300, poll * 2 ** min(failures, 4))
            log.warning("claim failed (%s); retrying in %ss", e, wait)
            if once:
                return 1
            time.sleep(wait)
            continue
        for job in jobs:
            if _stop:
                break
            try:
                res = process_job(api, job, allow_private=allow_private)
                log.info("job %s (%s) → %s", job["id"], (job.get("business") or {}).get("name"), res)
            except httpx.HTTPError as e:
                # the job stays "running"; the server reclaims stale locks after 10 minutes
                log.warning("could not report job %s: %s", job["id"], e)
        if once:
            return 0
        if not jobs:
            time.sleep(poll)
    return 0


def cli() -> None:
    ap = argparse.ArgumentParser(description="CRM website audit worker")
    ap.add_argument("--once", action="store_true", help="claim one batch, process it and exit")
    args = ap.parse_args()
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
    # httpx logs full request URLs at INFO — the PageSpeed URL contains the API key
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    sys.exit(run(once=args.once))


if __name__ == "__main__":
    cli()

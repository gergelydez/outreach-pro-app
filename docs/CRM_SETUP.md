# UK Business Hunter & Sales CRM — setup

The CRM lives inside this app at **`/crm`**. The existing Romanian tools (`/prospect`, `/rebuild`,
`/leads`, `/settings`) are unchanged.

## What you need (all of it already exists in this project)

| Variable | Used for | Already set? |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | CRM database (stored in the existing Vercel Blob store) | Yes — created when the Blob store was connected for “Rebuild” previews |
| `ANTHROPIC_API_KEY` | AI analysis, messages, proposals, reply assistant (Claude) | Yes — same key as the Romanian tools |
| `GOOGLE_PLACES_API_KEY` | Business Hunter (Google Places API **(New)**) | Yes — in Google Cloud also enable **Places API (New)** |

Nothing else is required: no password, no separate database, no OpenAI.
Open `/crm/settings` to see the status of each item.

```
Browser ──▶ Next.js on Vercel ──▶ CRM data: encrypted snapshot in Vercel Blob (PGlite / Postgres)
                    │  ├─▶ Google Places API (New)   (discovery)
                    │  └─▶ Claude API                 (AI features)
Python worker ──(Bearer token, optional)──┘   website audits
```

## How the database works

The CRM runs a real Postgres engine inside the server function (PGlite, WebAssembly). Its whole
state is one file in your Blob store, **encrypted with AES-256-GCM** (key derived from
`BLOB_READ_WRITE_TOKEN`) under a path nobody can guess.

- At the start of each request the app checks whether the file changed (a conditional GET; usually
  “304 not modified”, no download). Only requests that change data upload a new version.
- Writes are conditional on the version that was read (ETag). If two requests save at the same
  time, the second one reloads the newest data and runs again — nothing is overwritten.
- Tables are created and updated automatically on first use.
- Good for one user and hundreds to a few thousand leads. Each save uploads a few MB, so very heavy
  use counts against your Vercel Blob operations quota.
- **If you rotate `BLOB_READ_WRITE_TOKEN`**, set `CRM_DB_SECRET` to the *old* token, otherwise the
  existing CRM data can no longer be decrypted.
- Prefer a classic database? Set `DATABASE_URL` (Supabase/Neon) — it takes priority, and
  `npm run crm:migrate` or the button in Settings creates the tables there.

## Google Places API (New)

<https://console.cloud.google.com> → your project → **APIs & Services → Library** → enable
**Places API (New)** (billing must be on). The existing `GOOGLE_PLACES_API_KEY` works if its API
restrictions include Places API (New). Uses `places:searchText` with a field mask, `regionCode=GB`,
up to 3 pages per search; daily/per-run limits are in **Settings → Target market & limits**.
No Google Maps pages are scraped. Google-sourced fields are cleared after
`GOOGLE_DATA_RETENTION_DAYS` (default 30) by a daily Vercel cron, keeping only `place_id` + name.

## Claude

Uses `ANTHROPIC_API_KEY` with model `claude-opus-5-5` by default (`CLAUDE_MODEL` to change).
Structured JSON output, identical requests cached, hourly limit in **Settings → Limits**, token usage
and estimated cost on the AI Sales Assistant page. Every output is a draft you review; prompts tell
the model to use only verified facts and never invent reviews, prices or claims.

## Optional

- **Password:** set `CRM_PASSWORD` (and ideally `CRM_SESSION_SECRET`) to require a login on `/crm`.
  Without it the CRM is open, like the rest of the app — anyone with the URL can see it.
- **Website audits (Python worker):** set `CRM_WORKER_TOKEN` in Vercel and run the worker
  ([`worker/README.md`](../worker/README.md)) on any always-on machine with `CRM_API_URL`,
  the same token, and optionally `PAGESPEED_API_KEY` and `AUDIT_USE_PLAYWRIGHT=1`.
  Without the worker, leads are still found and scored on Google data; websites stay “unverified”.
- **CRON_SECRET:** optional; without it the daily retention job accepts Vercel Cron calls.

## Run locally

```bash
npm install
vercel env pull .env.local     # or copy BLOB_READ_WRITE_TOKEN, ANTHROPIC_API_KEY, GOOGLE_PLACES_API_KEY
npm run dev                    # http://localhost:3000/crm
```

## Tests

```bash
npm test                 # vitest: logic, integration (PGlite), Blob snapshot storage, Vercel Blob SDK adapter
npm run test:worker      # pytest: SSRF guard, extraction, PageSpeed parsing, worker loop, Playwright check
```

## Compliance notes (UK GDPR / PECR)

- Nothing is ever sent automatically. Drafts are copied/opened by you and marked as sent by you.
- Each lead records a subscriber type (limited company / sole trader / unknown). Email/SMS/WhatsApp
  marketing to sole traders and partnerships needs prior consent under PECR; the CRM warns before
  you draft. Phone calls: check the number against TPS/CTPS first.
- Every message includes an opt-out line. Opt-outs go to the suppression list and block re-import.
- This is guidance built into the workflow, not legal advice.

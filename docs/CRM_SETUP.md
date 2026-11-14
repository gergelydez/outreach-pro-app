# UK Business Hunter & Sales CRM — setup

The CRM lives inside this app at **`/crm`**. The existing Romanian tools (`/prospect`, `/rebuild`,
`/leads`, `/settings`) are unchanged.

```
Browser ──(cookie session)──▶ Next.js on Vercel ──▶ PostgreSQL
                                   │  ├─▶ Google Places API (New)  (discovery)
                                   │  └─▶ OpenAI                   (AI features)
Python worker ──(Bearer token)─────┘      claim jobs / send facts
   └─▶ public websites (SSRF-safe), PageSpeed Insights, Playwright
```

## 1. Database (required)

Any PostgreSQL 14+ works. Recommended: **Supabase** or **Neon** (free tiers are enough).

1. Create a project and copy the **pooled** connection string
   (Supabase: *Project → Connect → Transaction pooler*, port 6543; Neon: the `-pooler` host).
2. In Vercel → Project → Settings → Environment Variables add `DATABASE_URL`.
3. Create the tables — either:
   - open `/crm/settings` and press **Run migrations**, or
   - locally: `DATABASE_URL=... npm run crm:migrate`.

Migrations: `001_crm_core` (all tables, foreign keys, indexes) and `002_enable_rls`.
RLS is enabled on every CRM table with **no policies**, so Supabase's public REST API (anon key)
cannot read anything; the app connects as the database owner from the server only.

## 2. Access

| Variable | What |
|---|---|
| `CRM_PASSWORD` | Password for `/crm/login` (single user) |
| `CRM_SESSION_SECRET` | `openssl rand -hex 32` — signs the session cookie (recommended; if missing it is derived from the password, so changing the password logs you out) |
| `CRM_WORKER_TOKEN` | `openssl rand -hex 32` — shared with the Python worker |
| `CRON_SECRET` | `openssl rand -hex 32` — Vercel Cron sends it to the retention job |

Without `CRM_PASSWORD` the login page says it is not configured.

## 3. Google Places API (New) — discovery

1. <https://console.cloud.google.com> → select/create a project → **APIs & Services → Library** →
   enable **Places API (New)**. Billing must be enabled on the project.
2. **Credentials → Create credentials → API key**. Restrict it to *Places API (New)*
   (application restriction: none / IP — the key is only used server-side).
3. Set `GOOGLE_PLACES_API_KEY` in Vercel (the same variable the existing tools use).
4. Optional: `GOOGLE_PLACES_COST_PER_REQUEST` (USD, default 0.035) for the cost tracker, and
   `GOOGLE_DATA_RETENTION_DAYS` (default 30).

How it is used: `places:searchText` with a field mask (only the fields we need), `regionCode=GB`,
up to 3 pages per query. Daily and per-run limits are in **Settings → Target market & limits**.
No Google Maps pages are scraped. Google-sourced fields carry their source and fetch date; a daily
cron (`vercel.json`, 03:17 UTC) clears them after the retention period, keeping only the
`place_id` and name (which Google allows to be stored).

## 4. PageSpeed Insights — speed scores (optional)

1. Same Google Cloud project → enable **PageSpeed Insights API** → create (or reuse) an API key
   restricted to that API.
2. Set `PAGESPEED_API_KEY` **on the worker** (not in Vercel). Without it, speed shows as
   "not verified" and is excluded from the score instead of being guessed.

## 5. OpenAI — AI analysis, messages, proposals, reply assistant (optional)

1. <https://platform.openai.com/api-keys> → create a key; set a monthly budget limit in *Billing*.
2. Set `OPENAI_API_KEY` and `OPENAI_MODEL` (any model that supports Structured Outputs on the
   Responses API, e.g. `gpt-4.1-mini`).
3. Set `OPENAI_INPUT_COST_PER_1M` / `OPENAI_OUTPUT_COST_PER_1M` from OpenAI's pricing page for that
   model — they are only used to estimate cost in the CRM. The values in `.env.example` are examples.
4. Hourly request limit: **Settings → Limits → AI requests per hour**. Identical requests are cached.

The key is only read on the server. Every AI output is a draft you review; prompts tell the model to
use only the facts provided (audit, Google data, your notes) and never invent reviews, prices or claims.

## 6. Python audit worker

See [`worker/README.md`](../worker/README.md). Short version:

```bash
cd worker && pip install -r requirements.txt && playwright install chromium
CRM_API_URL=https://your-app.vercel.app CRM_WORKER_TOKEN=... PAGESPEED_API_KEY=... AUDIT_USE_PLAYWRIGHT=1 python -m crm_worker
```

Run it on any always-on machine (Railway/Fly.io/Render worker, a small VPS, or your PC while you
work). Jobs wait in the database until a worker picks them up; `/crm/audits` shows whether a worker
has been seen recently, the queue, failures and the dead-letter list (retry/cancel buttons).

## 7. Run locally

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL, CRM_PASSWORD, CRM_SESSION_SECRET, ...
npm run crm:migrate
npm run dev                    # http://localhost:3000/crm
```

## 8. Deploy

Push to the branch Vercel deploys (main). Add the environment variables above, redeploy, open
`/crm/settings` → **Run migrations**. Then start the worker with `CRM_API_URL` pointing at the
deployment.

## 9. Tests

```bash
npm test                 # vitest: logic + integration tests against an in-memory Postgres (PGlite)
npm run test:worker      # pytest: SSRF guard, extraction, PageSpeed parsing, worker loop, Playwright check
```

## Compliance notes (UK GDPR / PECR)

- Nothing is ever sent automatically. Drafts are copied/opened by you and marked as sent by you.
- Each lead records a subscriber type (limited company / sole trader / unknown). Email/SMS/WhatsApp
  marketing to sole traders and partnerships needs prior consent under PECR; the CRM warns before
  you draft. Phone calls: check the number against TPS/CTPS first.
- Every message template includes an opt-out line. Opt-outs go to the suppression list and block
  re-import of that business, email, phone or domain.
- This is guidance built into the workflow, not legal advice.

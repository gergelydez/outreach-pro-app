// Migrații SQL pentru modulul CRM (PostgreSQL: Supabase, Neon sau orice Postgres 13+).
// Ținute în cod (nu în fișiere .sql citite de pe disc) ca să fie incluse în
// bundle-ul serverless de pe Vercel. Se aplică în ordine, o singură dată fiecare.

export interface Migration { id: string; sql: string }

const TABLES = [
  'businesses', 'business_sources', 'website_audits', 'lead_scores', 'ai_analyses', 'pipeline_events',
  'outreach_messages', 'outreach_events', 'follow_up_tasks', 'proposals', 'proposal_items', 'crm_notes',
  'crm_activity', 'api_usage', 'discovery_jobs', 'audit_jobs', 'suppression_list', 'app_settings',
]

export const MIGRATIONS: Migration[] = [
  {
    id: '001_crm_core',
    sql: `
CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL DEFAULT 'owner',
  name text NOT NULL,
  category text,
  city text,
  region text,
  country text NOT NULL DEFAULT 'GB',
  address text,
  postcode text,
  phone text,
  phone_e164 text,
  email text,
  website_url text,
  website_domain text,
  google_place_id text,
  google_maps_url text,
  google_rating numeric(2,1),
  google_review_count integer,
  google_data_fetched_at timestamptz,
  business_status text,
  website_status text NOT NULL DEFAULT 'UNVERIFIED',
  whatsapp_status text NOT NULL DEFAULT 'UNVERIFIED',
  whatsapp_url text,
  whatsapp_source text,
  whatsapp_checked_at timestamptz,
  opportunity_score integer,
  opportunity_label text,
  stage text NOT NULL DEFAULT 'new_lead',
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  deal_value numeric(10,2),
  next_follow_up_at timestamptz,
  last_contacted_at timestamptz,
  subscriber_type text NOT NULL DEFAULT 'unknown',
  lawful_basis text,
  consent_notes text,
  lead_source text,
  tags text[] NOT NULL DEFAULT '{}',
  possible_duplicate_of uuid REFERENCES businesses(id) ON DELETE SET NULL,
  field_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovery_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS businesses_place_id_uq ON businesses (google_place_id) WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS businesses_domain_idx ON businesses (website_domain);
CREATE INDEX IF NOT EXISTS businesses_phone_idx ON businesses (phone_e164);
CREATE INDEX IF NOT EXISTS businesses_name_postcode_idx ON businesses (lower(name), postcode);
CREATE INDEX IF NOT EXISTS businesses_stage_idx ON businesses (stage);
CREATE INDEX IF NOT EXISTS businesses_score_idx ON businesses (opportunity_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS businesses_created_idx ON businesses (created_at DESC);
CREATE INDEX IF NOT EXISTS businesses_followup_idx ON businesses (next_follow_up_at);

-- Date brute de la furnizori (ex. Google Places), cu dată de expirare pentru reguli de retenție
CREATE TABLE IF NOT EXISTS business_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS business_sources_business_idx ON business_sources (business_id);
CREATE INDEX IF NOT EXISTS business_sources_expires_idx ON business_sources (expires_at);

CREATE TABLE IF NOT EXISTS website_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  url text,
  final_url text,
  reachable boolean,
  website_status text NOT NULL,
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  pagespeed jsonb,
  content_hash text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS website_audits_business_idx ON website_audits (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lead_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  score integer NOT NULL,
  label text NOT NULL,
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_scores_business_idx ON lead_scores (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  kind text NOT NULL,
  prompt_version text NOT NULL,
  input_hash text NOT NULL,
  model text NOT NULL,
  output jsonb NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,5) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_analyses_cache_idx ON ai_analyses (kind, input_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_analyses_business_idx ON ai_analyses (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pipeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_by text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pipeline_events_business_idx ON pipeline_events (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel text NOT NULL,
  subject text,
  body text NOT NULL,
  explanation_ro text,
  status text NOT NULL DEFAULT 'draft',
  source text NOT NULL DEFAULT 'manual',
  ai_analysis_id uuid REFERENCES ai_analyses(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_messages_business_idx ON outreach_messages (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outreach_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  message_id uuid REFERENCES outreach_messages(id) ON DELETE SET NULL,
  channel text,
  event_type text NOT NULL,
  reply_status text,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_events_business_idx ON outreach_events (business_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS outreach_events_type_idx ON outreach_events (event_type, occurred_at);

CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  due_at timestamptz NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS follow_up_tasks_due_idx ON follow_up_tasks (status, due_at);

CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  intro text,
  scope text,
  timeline text,
  terms text,
  currency text NOT NULL DEFAULT 'GBP',
  status text NOT NULL DEFAULT 'draft',
  total numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposals_business_idx ON proposals (business_id);

CREATE TABLE IF NOT EXISTS proposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  recurring text,
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS proposal_items_proposal_idx ON proposal_items (proposal_id, position);

CREATE TABLE IF NOT EXISTS crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_notes_business_idx ON crm_notes (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  type text NOT NULL,
  summary text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_activity_created_idx ON crm_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS crm_activity_business_idx ON crm_activity (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  operation text NOT NULL,
  units integer NOT NULL DEFAULT 1,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,5) NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_usage_created_idx ON api_usage (provider, created_at DESC);

CREATE TABLE IF NOT EXISTS discovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'google_places',
  country text NOT NULL DEFAULT 'GB',
  region text,
  city text NOT NULL,
  category text NOT NULL,
  query text NOT NULL,
  requested integer NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running',
  found integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  filtered integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS discovery_jobs_created_idx ON discovery_jobs (created_at DESC);

-- Coadă de joburi în Postgres (FOR UPDATE SKIP LOCKED), procesată de workerul Python
CREATE TABLE IF NOT EXISTS audit_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'audit',
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 4,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS audit_jobs_idem_uq ON audit_jobs (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_jobs_ready_idx ON audit_jobs (status, run_after);

CREATE TABLE IF NOT EXISTS suppression_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  value text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
  {
    // Pe Supabase, tabelele din schema public sunt expuse prin API-ul REST cu cheia
    // anon. Activăm RLS fără politici: accesul rămâne doar prin conexiunea directă a
    // serverului (rolul proprietar), nu prin cheile publice.
    id: '002_enable_rls',
    sql: TABLES.map(t => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n'),
  },
  {
    // Linkul demo-ului (site concept) publicat pentru afacere, ca la Rebuild RO
    id: '003_demo_preview',
    sql: `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS preview_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS demo_at timestamptz;`,
  },
  {
    // Țara afacerii (UK / HU): telefonul, căutarea și mesajele depind de ea
    id: '004_country',
    // coloana exista din 001 cu valoarea 'GB'; o unificăm la 'UK' / 'HU'
    sql: `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'UK';
UPDATE businesses SET country = 'UK' WHERE country IN ('GB', 'gb', 'United Kingdom');
ALTER TABLE businesses ALTER COLUMN country SET DEFAULT 'UK';
CREATE INDEX IF NOT EXISTS businesses_country_stage_idx ON businesses (country, stage);`,
  },
]

// Contractul dintre workerul Python (care vizitează site-urile) și server (care
// clasifică, punctează și salvează). Workerul trimite DOAR fapte observate;
// interpretarea lor e într-un singur loc, aici în TypeScript.

export interface PageSpeedFacts {
  fetched: boolean
  strategy?: 'mobile' | 'desktop'
  performance?: number | null      // 0–100
  accessibility?: number | null
  seo?: number | null
  best_practices?: number | null
  lcp_ms?: number | null
  cls?: number | null
  error?: string | null
}

export interface AuditFacts {
  checked_url?: string | null
  final_url?: string | null
  reachable: boolean
  http_status?: number | null
  error_kind?: 'dns' | 'timeout' | 'connection' | 'http_error' | 'blocked' | 'ssl' | 'unsafe_target' | 'too_large' | null
  https?: boolean
  has_viewport?: boolean
  title?: string | null
  meta_description?: string | null
  h1_count?: number
  headings?: string[]
  phones?: string[]
  emails?: string[]
  tel_links?: number
  mailto_links?: number
  whatsapp_links?: string[]
  whatsapp_widget?: boolean
  forms?: number
  contact_form?: boolean
  cta_texts?: string[]
  has_cta?: boolean
  local_seo?: { mentions_city?: boolean; has_postcode?: boolean; local_business_schema?: boolean }
  copyright_year?: number | null
  generator?: string | null
  old_tech?: string[]
  table_layout?: boolean
  page_kb?: number
  load_ms?: number
  service_links?: number
  nav_links?: number
  pagespeed?: PageSpeedFacts | null
  mobile?: { tested_with: 'playwright' | null; horizontal_overflow?: boolean | null; screenshot_taken?: boolean } | null
  // Pentru afacerile fără URL în profil: domeniile probabile verificate
  presence?: { checked: boolean; candidates: string[]; found_url?: string | null } | null
  content_hash?: string | null
}

export interface Finding {
  code: string
  severity: 'high' | 'medium' | 'low'
  what: string      // ce am detectat concret
  why: string       // de ce contează pentru clienții lor
  fix: string       // ce ar trebui îmbunătățit
  service: string   // ce serviciu putem vinde
  evidence?: string
}

export interface ScoreFactor {
  key: string
  label: string
  points: number
  max: number
  verified: boolean
  evidence: string
}

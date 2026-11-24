// Curățarea bazei de date: rămân doar firmele contactate / interesate / clienții (și cele marcate
// „nu e potrivit” sau „nu are WhatsApp”, ca să nu reapară la căutări). Restul se șterge; o bază mai mică
// înseamnă descărcări mai mici din Blob la fiecare pornire a serverului.
import { q, one } from './db'
import { CONTACTED_STAGES } from './constants'

const KEEP = `(
  b.stage = ANY('{${[...CONTACTED_STAGES, 'not_a_fit'].join(',')}}'::text[])
  OR (b.whatsapp_status = 'NOT_FOUND' AND coalesce(b.whatsapp_source, '') = 'manual')
  OR EXISTS (SELECT 1 FROM client_portals p WHERE p.business_id = b.id)
  OR EXISTS (SELECT 1 FROM client_accounts a WHERE a.business_id = b.id)
  OR b.live_url IS NOT NULL
)`

export async function cleanupPreview() {
  const n = async (sql: string) => Number((await one<{ n: string }>(sql))?.n || 0)
  return {
    keep: await n(`SELECT count(*)::text AS n FROM businesses b WHERE ${KEEP}`),
    remove: await n(`SELECT count(*)::text AS n FROM businesses b WHERE NOT ${KEEP}`),
    audits: await n(`SELECT count(*)::text AS n FROM website_audits`),
    analyses: await n(`SELECT count(*)::text AS n FROM ai_analyses`),
  }
}

export async function runCleanup(deps: { deleteFiles?: (paths: string[]) => Promise<void> } = {}) {
  const gone = await q<{ preview_url: string | null }>(`DELETE FROM businesses b WHERE NOT ${KEEP} RETURNING b.preview_url`)
  // la firmele rămase păstrăm doar ultimul audit și ultima analiză de fiecare fel
  await q(`DELETE FROM website_audits w WHERE w.created_at < (SELECT max(created_at) FROM website_audits x WHERE x.business_id = w.business_id)`)
  await q(`DELETE FROM ai_analyses a WHERE a.created_at < (SELECT max(created_at) FROM ai_analyses x WHERE x.business_id IS NOT DISTINCT FROM a.business_id AND x.kind = a.kind)`)
  await q(`DELETE FROM audit_jobs WHERE status NOT IN ('pending', 'running')`)
  await q(`DELETE FROM discovery_jobs WHERE created_at < now() - interval '14 days'`)
  await q(`DELETE FROM crm_activity WHERE created_at < now() - interval '60 days' AND business_id IS NULL`)
  await q(`DELETE FROM api_usage WHERE created_at < date_trunc('month', now())`)
  await q('VACUUM FULL').catch(() => {})
  // fișierele demo-urilor șterse (nu au fost trimise nimănui)
  const slugs = gone.map(g => g.preview_url?.match(/\/p\/([a-z0-9-]+)/)?.[1]).filter(Boolean) as string[]
  const paths = slugs.flatMap(s => [`previews/${s}.html`, `previews/${s}.png`, `site-data/${s}.json`])
  if (paths.length) {
    const del = deps.deleteFiles || (async (p: string[]) => { const { deleteFiles } = await import('@/lib/object-store'); await deleteFiles(p) })
    await del(paths).catch(() => {})
  }
  return { removed: gone.length, files: paths.length }
}

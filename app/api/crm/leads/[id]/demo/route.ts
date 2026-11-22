import { waitUntil } from '@vercel/functions'
import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { one } from '@/lib/crm/db'
import { startDemo, DEMO_STALE_MIN } from '@/lib/crm/demo'
import { publicOrigin } from '@/lib/public-url'

// Generarea durează 1–4 minute și continuă pe server după ce răspundem (waitUntil)
export const maxDuration = 300
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// Pornește demo-ul. Răspunde imediat; pagina poate fi închisă — linkul apare pe firmă când e gata.
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const b = await body<{ anthropic_key?: string; google_key?: string; designer?: string; style?: string }>(req)
  const r = await startDemo(id, {
    origin: publicOrigin(req),
    anthropicKey: str(b.anthropic_key, 300) || undefined,
    googleKey: str(b.google_key, 200) || undefined,
    designer: str(b.designer, 60) || undefined,
    style: str(b.style, 40) || undefined,
  }, { schedule: p => waitUntil(p) }).catch(e => {
    // configurare lipsă (cheia Claude) sau firmă inexistentă: mesaj clar, nu „Server error”
    throw new HttpError(/not found/i.test(String(e?.message)) ? 404 : 400, e instanceof Error ? e.message : String(e))
  })
  return json({ status: r.status, already: r.already, style: 'style' in r ? r.style : undefined })
})

// Starea demo-ului (pagina o verifică din când în când)
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const b = await one<{ demo_status: string | null; demo_error: string | null; demo_started_at: string | null; preview_url: string | null }>(
    'SELECT demo_status, demo_error, demo_started_at, preview_url FROM businesses WHERE id = $1', [id])
  if (!b) return json({ status: null })
  const stale = b.demo_status === 'running' && b.demo_started_at && Date.now() - new Date(b.demo_started_at).getTime() > DEMO_STALE_MIN * 60_000
  return json({ status: stale ? 'error' : b.demo_status, error: stale ? 'Generarea s-a întrerupt — apasă din nou „Fă demo”.' : b.demo_error, preview_url: b.preview_url, started_at: b.demo_started_at })
})

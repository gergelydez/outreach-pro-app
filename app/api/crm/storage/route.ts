import { route, json, body, str, HttpError } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'
import { r2Configured, blobConfigured, putFile, fixBlobUrls } from '@/lib/object-store'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Unde stau fișierele acum
export const GET = route(async () => json({ r2: r2Configured(), blob: blobConfigured() }))

// Copiază din Vercel Blob în R2, câte o pagină pe cerere (interfața repetă până la final).
// Paginile și datele (html/json) primesc linkurile noi; baza de date se mută singură la prima pornire.
export const POST = route(async (req: Request) => {
  if (!r2Configured()) throw new HttpError(400, 'R2 nu e configurat: pune în Vercel S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY și S3_ENDPOINT (ca la dashboard), apoi Redeploy.')
  if (!blobConfigured()) throw new HttpError(400, 'Blob-ul nu mai e conectat: nu am de unde copia.')
  const b = await body<{ cursor?: string }>(req)
  const started = Date.now()
  const { list } = await import('@vercel/blob')
  let cursor: string | undefined = str(b.cursor, 2000) || undefined
  let copied = 0, failed = 0
  do {
    const page = await list({ cursor, limit: 50 })
    for (const f of page.blobs) {
      if (f.pathname.startsWith('crm/')) continue
      try {
        const res = await fetch(f.url, { cache: 'no-store' })
        if (!res.ok) { failed++; continue }
        const type = res.headers.get('content-type') || 'application/octet-stream'
        const text = /html|json|text/.test(type)
        const data = text ? fixBlobUrls(await res.text()) : Buffer.from(await res.arrayBuffer())
        await putFile(f.pathname, data, { contentType: type, cacheSeconds: /^(cms|client-photos|edit-shots)\//.test(f.pathname) ? 31536000 : 60 })
        copied++
      } catch { failed++ }
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor && Date.now() - started < 40_000)
  // conținutul aplicațiilor clienților: linkurile vechi de poze → noile adrese
  if (!cursor) {
    const rows = await q<{ business_id: string; content: unknown }>('SELECT business_id, content FROM client_portals')
    for (const r of rows) {
      const t = JSON.stringify(r.content || {})
      const n = fixBlobUrls(t)
      if (n !== t) await q('UPDATE client_portals SET content = $2 WHERE business_id = $1', [r.business_id, n])
    }
  }
  return json({ copied, failed, cursor: cursor || null, done: !cursor })
})

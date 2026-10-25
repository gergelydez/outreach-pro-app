import { head } from '@vercel/blob'

// Servește preview-ul publicat. CSP sandbox îi dă o origine opacă, ca
// scripturile din demo să nu poată citi localStorage-ul aplicației (chei API).

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return new Response('Not found', { status: 404 })

  try {
    const meta = await head(`previews/${slug}.html`)
    const res = await fetch(meta.url, { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    return new Response(await res.text(), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'public, max-age=60',
      },
    })
  } catch {
    return new Response('<!doctype html><meta charset="utf-8"><title>Preview indisponibil</title><p style="font-family:system-ui;padding:40px">Acest preview nu mai este disponibil.</p>', {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}

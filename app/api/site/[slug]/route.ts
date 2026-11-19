// Datele publicate din panoul clientului (tarife, oferte, galerie, contact), citite de /cms.js pe site.
// Public și cu CORS deschis: site-ul clientului e pe alt domeniu. Rămâne în cache-ul Vercel câteva secunde.
export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }

export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  if (!/^[a-z0-9-]{3,60}$/.test(params.slug)) return new Response('Not found', { status: 404, headers: CORS })
  try {
    const { head } = await import('@vercel/blob')
    const meta = await head(`site-data/${params.slug}.json`)
    const res = await fetch(meta.url, { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    return new Response(await res.text(), { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=60' } })
  } catch {
    return new Response('{}', { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
}

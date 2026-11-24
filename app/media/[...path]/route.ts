import { getFile } from '@/lib/object-store'

export const dynamic = 'force-dynamic'

// Pozele și fișierele aplicației, servite din R2 (sau Blob) și ținute în cache-ul Vercel
export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const path = params.path.map(decodeURIComponent).join('/')
  if (!path || path.includes('..') || path.startsWith('crm/')) return new Response('Not found', { status: 404 })
  const f = await getFile(path).catch(() => null)
  if (!f) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60' } })
  // pozele au nume unice (se păstrează un an); capturile demo-urilor se refac (o oră)
  const long = /^(cms|client-photos|edit-shots)\//.test(path)
  return new Response(new Uint8Array(f.body), {
    headers: { 'Content-Type': f.contentType, 'Cache-Control': long ? 'public, max-age=31536000, immutable' : 'public, max-age=300, s-maxage=3600', 'Access-Control-Allow-Origin': '*' },
  })
}

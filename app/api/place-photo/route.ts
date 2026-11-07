import { NextRequest } from 'next/server'
import { signPhotoRef } from '@/lib/place-context'

// Proxy pentru pozele Google Maps folosite în concepte: cheia rămâne pe server,
// iar semnătura limitează proxy-ul la pozele pe care le-am pus noi în site.
// Nu copiem pozele (regulile Google Maps nu permit stocarea lor), le servim la cerere.

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref') || ''
  const sig = req.nextUrl.searchParams.get('sig') || ''
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key || !ref || ref.length > 1000 || sig !== signPhotoRef(ref)) {
    return new Response('Not found', { status: 404 })
  }

  const u = new URL('https://maps.googleapis.com/maps/api/place/photo')
  u.searchParams.set('maxwidth', '1600')
  u.searchParams.set('photo_reference', ref)
  u.searchParams.set('key', key)
  try {
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(10000) })
    const type = res.headers.get('content-type') || ''
    if (!res.ok || !type.startsWith('image/')) return new Response('Not found', { status: 404 })
    return new Response(res.body, {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

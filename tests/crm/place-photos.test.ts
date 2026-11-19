import { describe, it, expect, afterEach, vi } from 'vitest'
import { placeContext, signPhotoRef } from '@/lib/place-context'

describe('Google photos for demos', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GOOGLE_PLACES_API_KEY })

  it('uses Places API (New) for photos and reviews, and the proxy fetches the new photo URL', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k'
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url))
      if (String(url).includes('/v1/places/abc/photos/p1/media')) return new Response('img', { headers: { 'content-type': 'image/jpeg' } })
      if (String(url).startsWith('https://places.googleapis.com/v1/places/')) return new Response(JSON.stringify({
        photos: [{ name: 'places/abc/photos/p1', authorAttributions: [{ displayName: 'Roxana' }] }],
        reviews: [{ rating: 5, text: { text: 'Foarte curat, gazde minunate, recomand!' }, authorAttribution: { displayName: 'Ana Pop' } }],
      }))
      if (String(url).includes('/v1/places/abc/photos/p1/media')) return new Response('img', { headers: { 'content-type': 'image/jpeg' } })
      return new Response('{}', { status: 404 })
    }))
    const ctx = await placeContext({ placeId: 'abc', address: 'Str. X 1, Predeal 505300, România', city: 'Predeal', origin: 'https://app.test' })
    expect(ctx.photos[0].url).toBe(`https://app.test/api/place-photo?ref=${encodeURIComponent('places/abc/photos/p1')}&sig=${signPhotoRef('places/abc/photos/p1')}`)
    expect(ctx.reviews[0]).toMatchObject({ author: 'Ana', rating: 5 })
    expect(calls.some(c => c.includes('maps/api/place/details'))).toBe(false)

    const { GET } = await import('@/app/api/place-photo/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest(ctx.photos[0].url))
    expect(calls.at(-1)).toBe('https://places.googleapis.com/v1/places/abc/photos/p1/media?maxWidthPx=1600&key=k')
    expect(res.status).toBe(200)
    expect(calls.at(-1)).toBe('https://places.googleapis.com/v1/places/abc/photos/p1/media?maxWidthPx=1600&key=k')
  })

  it('falls back to the legacy API when the new one is not enabled', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('places.googleapis.com')
      ? new Response('{"error":{"status":"PERMISSION_DENIED"}}', { status: 403 })
      : new Response(JSON.stringify({ result: { photos: [{ photo_reference: 'legacyref' }], reviews: [] } }))))
    const ctx = await placeContext({ placeId: 'abc', address: 'Predeal', city: 'Predeal', origin: 'https://app.test' })
    expect(ctx.photos[0].url).toContain('ref=legacyref')
  })
})

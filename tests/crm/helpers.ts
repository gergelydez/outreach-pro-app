// Bază de date Postgres reală, în proces (PGlite), pentru testele de integrare.
import { PGlite } from '@electric-sql/pglite'
import { setDatabase, runMigrations, type Database } from '@/lib/crm/db'

export async function freshDb(): Promise<Database> {
  const pg = new PGlite()
  const database: Database = {
    query: (text, params) => pg.query(text, params as unknown[]) as Promise<{ rows: any[] }>, // eslint-disable-line @typescript-eslint/no-explicit-any
    transaction: fn => pg.transaction(tx => fn({ query: (t, p) => tx.query(t, p as unknown[]) as Promise<{ rows: any[] }> })), // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  setDatabase(database)
  await runMigrations(database)
  return database
}

export const req = (url: string, init: RequestInit & { json?: unknown } = {}) =>
  new Request(`http://localhost${url}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })

const jsonRes = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

// Imită Google Places API (varianta clasică): Text Search pe pagini + Place Details per firmă.
// `place()` descrie firma; mock-ul o împarte în câmpurile întoarse de fiecare endpoint.
export function legacyPlacesMock(pages: Record<string, any>[][]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const all = new Map(pages.flat().map(p => [p.id, p]))
  const calls = { textSearch: 0, details: 0, urls: [] as string[] }
  const fn = async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    calls.urls.push(url.toString())
    if (url.pathname.endsWith('/textsearch/json')) {
      const token = url.searchParams.get('pagetoken')
      const i = token ? Number(token.replace('token', '')) : 0
      calls.textSearch++
      const page = pages[i] || []
      return jsonRes({
        status: page.length ? 'OK' : 'ZERO_RESULTS',
        results: page.map(p => ({ place_id: p.id, name: p.displayName?.text, formatted_address: p.formattedAddress, rating: p.rating, user_ratings_total: p.userRatingCount, business_status: p.businessStatus, types: ['plumber'] })),
        next_page_token: i < pages.length - 1 ? `token${i + 1}` : undefined,
      })
    }
    if (url.pathname.endsWith('/details/json')) {
      calls.details++
      const p = all.get(url.searchParams.get('place_id'))
      if (!p) return jsonRes({ status: 'NOT_FOUND' })
      return jsonRes({ status: 'OK', result: { formatted_phone_number: p.nationalPhoneNumber, international_phone_number: p.internationalPhoneNumber, website: p.websiteUri, url: p.googleMapsUri, business_status: p.businessStatus } })
    }
    return new Response('unexpected', { status: 404 })
  }
  return { fetch: fn as unknown as typeof fetch, calls }
}

export const place = (id: string, extra: Record<string, unknown> = {}) => ({
  id, displayName: { text: `Biz ${id}` }, formattedAddress: `1 High St, Birmingham B1 1AA, UK`,
  nationalPhoneNumber: `0121 496 ${String(1000 + Number(id.replace(/\D/g, '') || 0)).slice(-4)}`,
  rating: 4.7, userRatingCount: 40, googleMapsUri: `https://maps.google.com/?cid=${id}`, businessStatus: 'OPERATIONAL', ...extra,
})

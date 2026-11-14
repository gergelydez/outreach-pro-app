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

export function placesResponse(places: Record<string, unknown>[], nextPageToken?: string) {
  return new Response(JSON.stringify({ places, nextPageToken }), { status: 200, headers: { 'content-type': 'application/json' } })
}

export const place = (id: string, extra: Record<string, unknown> = {}) => ({
  id, displayName: { text: `Biz ${id}` }, formattedAddress: `1 High St, Birmingham B1 1AA, UK`,
  nationalPhoneNumber: `0121 496 ${String(1000 + Number(id.replace(/\D/g, '') || 0)).slice(-4)}`,
  rating: 4.7, userRatingCount: 40, googleMapsUri: `https://maps.google.com/?cid=${id}`, businessStatus: 'OPERATIONAL', ...extra,
})

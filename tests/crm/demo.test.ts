import { describe, it, expect, beforeEach } from 'vitest'
import { startDemo } from '@/lib/crm/demo'
import { SnapshotDatabase, SnapshotConflict, type SnapshotStore } from '@/lib/crm/blob-db'
import { runMigrations, setDatabase, one, withDbSession } from '@/lib/crm/db'
import { freshDb } from './helpers'

function memoryStore() {
  const s = { data: null as Buffer | null, etag: null as string | null, v: 0 }
  const store: SnapshotStore = {
    async load(etag) { if (!s.data) return null; if (etag && etag === s.etag) return { notModified: true }; return { notModified: false, data: s.data, etag: s.etag! } },
    async save(data, etag) { if ((s.etag ?? null) !== (etag ?? null)) throw new SnapshotConflict('changed'); s.data = data; s.etag = `e${++s.v}`; return s.etag },
  }
  return store
}

const fakeDeps = (published: Record<string, string>, gen?: () => Promise<string>) => ({
  generate: gen || (async (prompt: string) => `<!DOCTYPE html><html><head></head><body><h1>Demo</h1><!--${prompt.length}--></body></html>`),
  publish: async (slug: string, html: string) => { published[slug] = html },
  siteContent: async () => null,
})

describe('demo generated fully on the server (page can be closed)', () => {
  beforeEach(() => { process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store_secret' })

  it('marks running, finishes in the background, saves the link and an English/Hungarian banner', async () => {
    await freshDb()
    const b = await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source, website_status, country) VALUES ('Kovács Fűtés', 'heating', 'Debrecen', 'google_places', 'NO_WEBSITE', 'HU') RETURNING id`)
    const published: Record<string, string> = {}
    const r = await startDemo(b!.id, { origin: 'https://app.test', designer: 'Geri' }, fakeDeps(published))
    expect(r.status).toBe('running')
    expect((await one<{ demo_status: string }>('SELECT demo_status FROM businesses WHERE id = $1', [b!.id]))!.demo_status).toBe('running')
    const url = await r.job
    expect(url).toMatch(/^https:\/\/app\.test\/p\/kovacs-futes-[0-9a-f]{6}$/)
    const row = (await one<{ demo_status: string; preview_url: string }>('SELECT demo_status, preview_url FROM businesses WHERE id = $1', [b!.id]))!
    expect(row).toEqual({ demo_status: 'done', preview_url: url })
    expect(Object.values(published)[0]).toContain('nem a hivatalos oldal')
    // a doua oară: același link (poate a fost deja trimis)
    const again = await startDemo(b!.id, { origin: 'https://app.test' }, fakeDeps(published))
    expect(await again.job).toBe(url)
  })

  it('a second press while it is running does not start another generation', async () => {
    await freshDb()
    const b = await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source, website_status) VALUES ('X', 'plumber', 'Leeds', 'google_places', 'NO_WEBSITE') RETURNING id`)
    let release: (() => void) | undefined
    const slow = () => new Promise<string>(res => { release = () => res('<html><body>x</body></html>') })
    const first = await startDemo(b!.id, { origin: 'https://app.test' }, fakeDeps({}, slow))
    const second = await startDemo(b!.id, { origin: 'https://app.test' }, fakeDeps({}))
    expect(second).toMatchObject({ status: 'running', already: true })
    while (!release) await new Promise(r => setTimeout(r, 20))
    release(); await first.job
  })

  it('records a readable error instead of hanging', async () => {
    await freshDb()
    const b = await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source, website_status) VALUES ('X', 'plumber', 'Leeds', 'google_places', 'NO_WEBSITE') RETURNING id`)
    const r = await startDemo(b!.id, { origin: 'https://app.test' }, fakeDeps({}, async () => { throw new Error('Demo-ul a fost tăiat (prea lung) — încearcă din nou') }))
    expect(await r.job).toBeNull()
    expect(await one('SELECT demo_status, demo_error FROM businesses WHERE id = $1', [b!.id])).toEqual({ demo_status: 'error', demo_error: 'Demo-ul a fost tăiat (prea lung) — încearcă din nou' })
  })

  it('with the Blob-stored database, the link saved after the request ended is really persisted', async () => {
    const store = memoryStore()
    const db1 = new SnapshotDatabase(store, runMigrations)
    setDatabase(db1)
    const id = await withDbSession(async () => (await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source, website_status) VALUES ('Moseley Plumbing', 'plumber', 'Birmingham', 'google_places', 'NO_WEBSITE') RETURNING id`))!.id)
    let release!: () => void
    const gate = new Promise<void>(res => { release = res })
    // cererea „Fă demo” se termină imediat…
    const r = await withDbSession(() => startDemo(id, { origin: 'https://app.test' }, fakeDeps({}, async () => { await gate; return '<html><body>demo</body></html>' })))
    // …iar demo-ul se termină abia după ce cererea s-a încheiat
    release()
    const url = await r.job
    // o instanță „rece” (alt server) citește doar ce s-a salvat în Blob
    const db2 = new SnapshotDatabase(store, runMigrations)
    const row = await db2.session(() => db2.query('SELECT demo_status, preview_url FROM businesses WHERE id = $1', [id]))
    expect(row.rows[0]).toEqual({ demo_status: 'done', preview_url: url })
    setDatabase(null)
  }, 60_000)
})

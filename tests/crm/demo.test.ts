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
  screenshot: async () => {},
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

describe('client edits + final site download', () => {
  beforeEach(() => { process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store_secret' })

  it('Claude edits the existing site on the same link (without the banner in the prompt), banner is put back', async () => {
    const { startEdit } = await import('@/lib/crm/demo')
    const { withConceptBanner } = await import('@/lib/preview')
    await freshDb()
    const b = await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source, website_status, country, preview_url) VALUES ('Pensiunea Bradul', 'pension', 'Brașov', 'google_places', 'NO_WEBSITE', 'RO', 'https://app.test/p/pensiunea-bradul-abc123') RETURNING id`)
    const stored: Record<string, string> = { 'pensiunea-bradul-abc123': withConceptBanner('<!DOCTYPE html><html><head></head><body><h1>Tel 0722 111 111</h1></body></html>', 'Pensiunea Bradul', 'Grig', 'ro') }
    let seen = ''
    const shots: string[] = []
    const r = await startEdit(b!.id, { instructions: 'schimbă telefonul în 0722 000 000', designer: 'Grig' }, {
      load: async slug => stored[slug],
      generate: async prompt => { seen = prompt; return '<!DOCTYPE html><html><head></head><body><h1>Tel 0722 000 000</h1></body></html>' },
      publish: async (slug, html) => { stored[slug] = html },
      screenshot: async (slug, html) => { shots.push(slug + ':' + html.length) },
    })
    expect(await r.job).toBe(true)
    expect(seen).toContain('schimbă telefonul în 0722 000 000')
    expect(shots).toHaveLength(1) // poza se reface după modificări
    expect(seen).toContain('Tel 0722 111 111')
    expect(seen).not.toContain('concept-banner')
    expect(stored['pensiunea-bradul-abc123']).toContain('0722 000 000')
    expect(stored['pensiunea-bradul-abc123']).toContain('concept-banner')
    expect(await one('SELECT demo_status, preview_url FROM businesses WHERE id = $1', [b!.id])).toEqual({ demo_status: 'done', preview_url: 'https://app.test/p/pensiunea-bradul-abc123' })
  })

  it('refuses edits when there is no demo yet', async () => {
    const { startEdit } = await import('@/lib/crm/demo')
    await freshDb()
    const b = await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source, website_status) VALUES ('X', 'plumber', 'Leeds', 'google_places', 'NO_WEBSITE') RETURNING id`)
    await expect(startEdit(b!.id, { instructions: 'x y z' }, { generate: async () => '' })).rejects.toThrow(/fă mai întâi demo-ul/)
  })

  it('final version has no banner / noindex; zip is valid', async () => {
    const { withConceptBanner, stripConceptBanner } = await import('@/lib/preview')
    const { zipSingleFile, crc32 } = await import('@/lib/crm/zip')
    const orig = '<!DOCTYPE html><html><head><title>A</title></head><body><p>Hello</p></body></html>'
    const clean = stripConceptBanner(withConceptBanner(orig, 'A', 'Grig', 'ro'))
    expect(clean).not.toMatch(/concept-banner|noindex/)
    expect(clean).toContain('<p>Hello</p>')
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
    const zip = zipSingleFile('index.html', Buffer.from(clean))
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50)
    expect(zip.includes(Buffer.from(clean))).toBe(true)
  })
})

describe('screenshot of the demo (for WhatsApp)', () => {
  it('takes a real phone-size PNG of the page, without the concept banner', async () => {
    const { screenshotHtml } = await import('@/lib/crm/screenshot')
    const { withConceptBanner } = await import('@/lib/preview')
    const png = await screenshotHtml(withConceptBanner('<!DOCTYPE html><html><head><style>body{margin:0;background:#c2185b;color:#fff;font:700 40px sans-serif}</style></head><body><h1>Lolliland</h1></body></html>', 'Lolliland', 'Geri', 'hu'))
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(780) // 390 px × 2 (retina)
    expect(png.readUInt32BE(20)).toBe(1688)
  }, 60_000)
})

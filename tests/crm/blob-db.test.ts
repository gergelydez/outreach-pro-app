import { describe, it, expect, beforeEach } from 'vitest'
import { SnapshotDatabase, SnapshotConflict, encrypt, decrypt, snapshotPath, type SnapshotStore } from '@/lib/crm/blob-db'
import { runMigrations, setDatabase, q } from '@/lib/crm/db'
import { route, json, body } from '@/lib/crm/api'
import { req } from './helpers'

// Imită Vercel Blob: un singur obiect cu ETag și scriere condiționată (ifMatch)
function memoryStore() {
  const s = { data: null as Buffer | null, etag: null as string | null, saves: 0, loads: 0, v: 0 }
  const store: SnapshotStore = {
    async load(etag) {
      s.loads++
      if (!s.data) return null
      if (etag && etag === s.etag) return { notModified: true }
      return { notModified: false, data: s.data, etag: s.etag! }
    },
    async save(data, etag) {
      if ((s.etag ?? null) !== (etag ?? null)) throw new SnapshotConflict('changed')
      s.saves++; s.data = data; s.etag = `e${++s.v}`
      return s.etag
    },
  }
  return { s, store }
}

const instance = (store: SnapshotStore) => new SnapshotDatabase(store, runMigrations)

describe('CRM database stored in Vercel Blob (snapshot)', () => {
  beforeEach(() => { process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store_secret'; delete process.env.CRM_DB_SECRET })

  it('creates the tables automatically and persists between instances (cold starts)', async () => {
    const { s, store } = memoryStore()
    const a = instance(store)
    await a.session(async () => { await a.query(`INSERT INTO suppression_list (kind, value) VALUES ('email', 'x@y.co.uk')`) })
    expect(s.saves).toBe(1)
    const b = instance(store) // altă instanță serverless
    const rows = await b.session(() => b.query('SELECT value FROM suppression_list'))
    expect(rows.rows).toEqual([{ value: 'x@y.co.uk' }])
  }, 60_000)

  it('does not upload anything for read-only requests', async () => {
    const { s, store } = memoryStore()
    const a = instance(store)
    await a.session(async () => { await a.query(`INSERT INTO suppression_list (kind, value) VALUES ('email', 'a@b.co.uk')`) })
    const saves = s.saves
    await a.session(() => a.query('SELECT count(*) FROM suppression_list'))
    await a.session(() => a.query(`UPDATE suppression_list SET reason = 'x' WHERE value = 'nobody'`)) // 0 rânduri afectate
    expect(s.saves).toBe(saves)
  }, 60_000)

  it('on a concurrent write it reloads and re-runs the request, so both changes survive', async () => {
    const { store } = memoryStore()
    const a = instance(store), b = instance(store)
    await a.session(async () => { await a.query(`INSERT INTO suppression_list (kind, value) VALUES ('email', 'first@x.co.uk')`) })
    await b.session(() => b.query('SELECT 1')) // b are snapshot-ul curent
    await a.session(async () => { await a.query(`INSERT INTO suppression_list (kind, value) VALUES ('email', 'second@x.co.uk')`) })
    let runs = 0
    await b.session(async () => { runs++; await b.query(`INSERT INTO suppression_list (kind, value) VALUES ('email', 'third@x.co.uk')`) })
    expect(runs).toBe(1) // b s-a sincronizat la începutul sesiunii, deci fără conflict
    // conflict real: două instanțe pornesc de la aceeași versiune
    const c = instance(store), d = instance(store)
    await c.session(() => c.query('SELECT 1')); await d.session(() => d.query('SELECT 1'))
    let dRuns = 0
    await Promise.all([
      c.session(async () => { await c.query(`INSERT INTO suppression_list (kind, value) VALUES ('email', 'c@x.co.uk')`) }),
      d.session(async () => { dRuns++; await new Promise(r => setTimeout(r, 50)); await d.query(`INSERT INTO suppression_list (kind, value) VALUES ('email', 'd@x.co.uk')`) }),
    ])
    const e = instance(store)
    const vals = (await e.session(() => e.query('SELECT value FROM suppression_list ORDER BY value'))).rows.map(r => r.value)
    expect(vals).toEqual(['c@x.co.uk', 'd@x.co.uk', 'first@x.co.uk', 'second@x.co.uk', 'third@x.co.uk'])
    expect(dRuns).toBeGreaterThanOrEqual(1)
  }, 120_000)

  it('API routes run inside a session and a retried request can read its body again', async () => {
    const { s, store } = memoryStore()
    const database = instance(store)
    setDatabase(database)
    let calls = 0
    const handler = route(async (r: Request) => {
      calls++
      const b = await body<{ v: string }>(r)
      if (calls === 1) s.etag = 'changed-by-someone-else' // simulează altă instanță care a salvat
      await q(`INSERT INTO suppression_list (kind, value) VALUES ('email', $1)`, [b.v])
      return json({ ok: true })
    })
    // pregătește un snapshot existent
    await database.session(async () => { await database.query('SELECT 1') })
    await database.session(async () => { await database.query(`INSERT INTO suppression_list (kind, value) VALUES ('domain', 'seed.co.uk')`) })
    const res = await handler(req('/x', { method: 'POST', json: { v: 'retry@x.co.uk' } }))
    expect(res.status).toBe(200)
    expect(calls).toBe(2)
    setDatabase(null)
  }, 60_000)

  it('encrypts the snapshot and keeps the path unguessable', () => {
    const enc = encrypt(Buffer.from('secret data'))
    expect(enc.includes(Buffer.from('secret data'))).toBe(false)
    expect(decrypt(enc).toString()).toBe('secret data')
    expect(snapshotPath()).toMatch(/^crm\/db-[0-9a-f]{32}\.bin$/)
    expect(snapshotPath()).not.toContain('secret')
    process.env.BLOB_READ_WRITE_TOKEN = 'another-token'
    expect(() => decrypt(enc)).toThrow(/CRM_DB_SECRET/)
    process.env.CRM_DB_SECRET = 'vercel_blob_rw_store_secret'
    expect(decrypt(enc).toString()).toBe('secret data')
  })
})

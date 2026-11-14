// Testează adaptorul real @vercel/blob (get/put/head din SDK) contra unui emulator local al
// API-ului Vercel Blob: ETag, scriere condiționată (x-if-match), 304, conflict.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { SnapshotDatabase, SnapshotConflict, vercelBlobStore, snapshotPath } from '@/lib/crm/blob-db'
import { runMigrations } from '@/lib/crm/db'

const objects = new Map<string, { data: Buffer; etag: string }>()
let version = 0
const seen: { method: string; headers: http.IncomingHttpHeaders }[] = []
let server: http.Server
let previous: Dispatcher

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x')
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    seen.push({ method: req.method!, headers: req.headers })
    const send = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (req.method === 'PUT') {
      const pathname = url.searchParams.get('pathname')!
      const cur = objects.get(pathname)
      const ifMatch = req.headers['x-if-match']
      if (ifMatch && (!cur || cur.etag !== ifMatch)) return send(412, { error: { code: 'precondition_failed', message: 'ETag mismatch' } })
      if (cur && req.headers['x-allow-overwrite'] !== '1') return send(400, { error: { code: 'bad_request', message: 'This blob already exists' } })
      const etag = `"v${++version}"`
      objects.set(pathname, { data: Buffer.concat(chunks), etag })
      return send(200, { url: `https://store.public.blob.vercel-storage.com/${pathname}`, downloadUrl: '', pathname, contentType: 'application/octet-stream', contentDisposition: '', etag })
    }
    if (req.method === 'GET') { // head()
      const target = url.searchParams.get('url') || ''
      const pathname = target.replace(/^https:\/\/[^/]+\//, '')
      const cur = objects.get(pathname)
      if (!cur) return send(404, { error: { code: 'not_found', message: 'not found' } })
      return send(200, { url: target, downloadUrl: '', pathname, size: cur.data.length, uploadedAt: new Date().toISOString(), contentType: 'application/octet-stream', contentDisposition: '', cacheControl: '', etag: cur.etag })
    }
    send(405, {})
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_secretpart'
  delete process.env.CRM_DB_SECRET
  // get() citește direct de la URL-ul public al store-ului → îl servim din emulator (prin undici)
  previous = getGlobalDispatcher()
  const agent = new MockAgent()
  agent.enableNetConnect(/^127\.0\.0\.1(:\d+)?$/)
  agent.get('https://store123.public.blob.vercel-storage.com').intercept({ path: () => true, method: 'GET' }).reply(opts => {
    const pathname = new URL(opts.path, 'https://x').pathname.slice(1)
    const cur = objects.get(pathname)
    if (!cur) return { statusCode: 404, data: 'not found' }
    const h = opts.headers as Record<string, string> | string[] | undefined
    const inm = Array.isArray(h) ? h[h.findIndex(x => String(x).toLowerCase() === 'if-none-match') + 1] : h && Object.entries(h).find(([k]) => k.toLowerCase() === 'if-none-match')?.[1]
    if (inm && inm === cur.etag) return { statusCode: 304, data: '', responseOptions: { headers: { etag: cur.etag } } }
    return { statusCode: 200, data: cur.data, responseOptions: { headers: { etag: cur.etag, 'content-length': String(cur.data.length) } } }
  }).persist()
  setGlobalDispatcher(agent)
})
afterAll(() => { setGlobalDispatcher(previous); server.close() })

describe('Vercel Blob adapter (real SDK calls)', () => {
  it('saves, loads with 304, rejects stale writes and persists the database', async () => {
    const store = vercelBlobStore()
    expect(await store.load(null)).toBeNull()
    const e1 = await store.save(Buffer.from('one'), null)
    expect(objects.get(snapshotPath())?.data.toString()).toBe('one')
    expect(await store.load(e1)).toEqual({ notModified: true })
    const full = await store.load(null)
    expect(full && !full.notModified && full.data.toString()).toBe('one')
    const e2 = await store.save(Buffer.from('two'), e1)
    expect(seen.some(s => s.method === 'PUT' && s.headers['x-if-match'] === e1)).toBe(true)
    await expect(store.save(Buffer.from('stale'), e1)).rejects.toBeInstanceOf(SnapshotConflict)
    await expect(store.save(Buffer.from('dup-create'), null)).rejects.toBeInstanceOf(SnapshotConflict)
    expect(e2).not.toBe(e1)

    objects.clear()
    const a = new SnapshotDatabase(vercelBlobStore(), runMigrations)
    await a.session(async () => { await a.query(`INSERT INTO suppression_list (kind, value) VALUES ('phone', '+441214960000')`) })
    const stored = objects.get(snapshotPath())!
    expect(stored.data.subarray(0, 4).toString()).toBe('CRM1') // criptat
    const b = new SnapshotDatabase(vercelBlobStore(), runMigrations)
    const r = await b.session(() => b.query('SELECT value FROM suppression_list'))
    expect(r.rows).toEqual([{ value: '+441214960000' }])
  }, 60_000)
})

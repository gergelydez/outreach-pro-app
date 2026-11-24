import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// R2 simulat (S3: PUT / GET / HEAD / DELETE / list, ETag + condiții) și un Blob vechi simulat
const r2 = new Map<string, { body: Buffer; type: string; etag: string }>()
const blobFiles = new Map<string, { body: Buffer; type: string }>()
let n = 0

vi.mock('@vercel/blob', () => ({
  head: async (p: string) => { const f = blobFiles.get(p); if (!f) throw Object.assign(new Error('not found'), { name: 'BlobNotFoundError' }); return { url: `https://abc123.public.blob.vercel-storage.com/${p}`, etag: `"b-${p}"`, contentType: f.type } },
  get: async (p: string) => { const f = blobFiles.get(p); return f ? { statusCode: 200, stream: new Response(new Uint8Array(f.body)).body } : null },
  BlobNotFoundError: class extends Error {},
  BlobPreconditionFailedError: class extends Error {},
}))

const realFetch = globalThis.fetch
function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = input instanceof Request ? input : new Request(String(input), init)
  const u = new URL(req.url)
  if (u.hostname.endsWith('.blob.vercel-storage.com')) {
    const f = blobFiles.get(decodeURIComponent(u.pathname.slice(1)))
    return Promise.resolve(f ? new Response(new Uint8Array(f.body), { headers: { 'content-type': f.type } }) : new Response('', { status: 404 }))
  }
  return (async () => {
    const key = decodeURIComponent(u.pathname.replace(/^\/bucket\//, ''))
    if (u.searchParams.get('list-type') === '2') {
      const pre = u.searchParams.get('prefix') || ''
      return new Response(`<r>${Array.from(r2.keys()).filter(k => k.startsWith(pre)).map(k => `<Key>${k}</Key>`).join('')}<IsTruncated>false</IsTruncated></r>`)
    }
    const cur = r2.get(key)
    if (req.method === 'PUT') {
      const im = req.headers.get('if-match'), inm = req.headers.get('if-none-match')
      if ((im && (!cur || cur.etag !== im)) || (inm === '*' && cur)) return new Response('', { status: 412 })
      const etag = `"e${++n}"`
      r2.set(key, { body: Buffer.from(await req.arrayBuffer()), type: req.headers.get('content-type') || '', etag })
      return new Response('', { headers: { etag } })
    }
    if (req.method === 'DELETE') { r2.delete(key); return new Response('', { status: 204 }) }
    if (!cur) return new Response('', { status: 404 })
    if (req.headers.get('if-none-match') === cur.etag) return new Response(null, { status: 304 })
    return new Response(req.method === "HEAD" ? null : new Uint8Array(cur.body), { headers: { etag: cur.etag, 'content-type': cur.type } })
  })()
}

describe('Cloudflare R2 storage', () => {
  beforeEach(() => {
    r2.clear(); blobFiles.clear()
    Object.assign(process.env, { S3_BUCKET: 'bucket', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's', S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com', PUBLIC_APP_URL: 'https://app.test', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_test' })
    globalThis.fetch = fakeFetch as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    for (const k of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT', 'PUBLIC_APP_URL', 'BLOB_READ_WRITE_TOKEN']) delete process.env[k]
  })

  it('saves under the outreach/ folder, serves through /media and lists / deletes', async () => {
    const s = await import('@/lib/object-store')
    const r = await s.putFile('previews/hanul.html', '<html>hi</html>', { contentType: 'text/html' })
    expect(r.url).toBe('https://app.test/media/previews/hanul.html')
    expect(r2.has('outreach/previews/hanul.html')).toBe(true)
    expect(await s.getText('previews/hanul.html')).toBe('<html>hi</html>')
    await s.putFile('client-photos/1/a.jpg', Buffer.from('x'), { contentType: 'image/jpeg' })
    expect(await s.listFiles('client-photos/1/')).toEqual(['https://app.test/media/client-photos/1/a.jpg'])
    await s.deleteFiles(['https://app.test/media/client-photos/1/a.jpg'])
    expect(r2.has('outreach/client-photos/1/a.jpg')).toBe(false)
  })

  it('reads a file still in Blob, copies it to R2 and rewrites old Blob links', async () => {
    const s = await import('@/lib/object-store')
    blobFiles.set('previews/old.html', { body: Buffer.from('<img src="https://abc123.public.blob.vercel-storage.com/cms/1/p.jpg">'), type: 'text/html' })
    expect(await s.getText('previews/old.html')).toBe('<img src="https://app.test/media/cms/1/p.jpg">')
    expect(r2.has('outreach/previews/old.html')).toBe(true)
  })

  it('database: copied from Blob on first start, then conditional saves detect conflicts', async () => {
    const { r2Store, snapshotPath, SnapshotConflict } = await import('@/lib/crm/blob-db')
    blobFiles.set(snapshotPath(), { body: Buffer.from('DBDATA'), type: 'application/octet-stream' })
    const store = r2Store()
    const first = await store.load(null)
    expect(first && !first.notModified && first.data.toString()).toBe('DBDATA')
    const etag = first && !first.notModified ? first.etag : ''
    expect(await store.load(etag)).toEqual({ notModified: true })
    const e2 = await store.save(Buffer.from('NEW'), etag)
    await expect(store.save(Buffer.from('STALE'), etag)).rejects.toBeInstanceOf(SnapshotConflict)
    const again = await store.load(null)
    expect(again && !again.notModified && again.data.toString()).toBe('NEW')
    expect(again && !again.notModified && again.etag).toBe(e2)
  })
})

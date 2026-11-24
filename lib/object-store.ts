// Fișierele aplicației (baza de date, demo-urile, pozele, datele site-urilor): în Cloudflare R2 dacă sunt
// setate cheile S3_* (aceleași nume ca în aplicația dashboard), altfel în Vercel Blob, ca până acum.
// R2: traficul de descărcare e gratuit. Tot ce nu a fost încă mutat se citește din Blob și se copiază
// automat în R2 la prima folosire (cât timp Blob-ul încă răspunde).
import { AwsClient } from 'aws4fetch'

const env = (k: string) => (process.env[k] || '').trim()
export const r2Configured = () => !!(env('S3_BUCKET') && env('S3_ACCESS_KEY_ID') && env('S3_SECRET_ACCESS_KEY') && env('S3_ENDPOINT'))
export const blobConfigured = () => !!env('BLOB_READ_WRITE_TOKEN')
// toate fișierele aplicației stau într-un „folder” separat din bucket (bucket-ul e comun cu dashboard-ul)
export const keyPrefix = () => (process.env.S3_PREFIX ?? 'outreach/').replace(/^\/+/, '')

let aws: AwsClient | null = null
function s3(): AwsClient {
  if (!aws) aws = new AwsClient({ accessKeyId: env('S3_ACCESS_KEY_ID'), secretAccessKey: env('S3_SECRET_ACCESS_KEY'), service: 's3', region: /r2\.cloudflarestorage\.com/.test(env('S3_ENDPOINT')) ? 'auto' : env('S3_REGION') || 'auto' })
  return aws
}
const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/')
const objectUrl = (path: string) => `${env('S3_ENDPOINT').replace(/\/+$/, '')}/${env('S3_BUCKET')}/${enc(keyPrefix() + path.replace(/^\/+/, ''))}`

// Adresa publică a unui fișier: prin aplicație (/media/…), servit din R2 și ținut în cache-ul Vercel
export function appBase(): string {
  const u = env('PUBLIC_APP_URL').replace(/\/+$/, '')
  if (/^https?:\/\//.test(u)) return u
  const prod = env('VERCEL_PROJECT_PRODUCTION_URL')
  return prod ? `https://${prod}` : ''
}
export const mediaUrl = (path: string) => `${appBase()}/media/${enc(path.replace(/^\/+/, ''))}`

// Linkurile vechi de Blob (în demo-uri, poze, date) → aceleași fișiere prin /media/
const BLOB_URL = /https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/([^"'\s)<>\\]+)/g
export function fixBlobUrls(text: string): string {
  if (!r2Configured()) return text
  return text.replace(BLOB_URL, (_m, p: string) => mediaUrl(decodeURIComponent(p.split('?')[0])))
}

export interface StoredFile { body: Buffer; contentType: string; etag: string }

async function blobRead(path: string): Promise<StoredFile | null> {
  if (!blobConfigured()) return null
  const { head } = await import('@vercel/blob')
  const meta = await head(path).catch(() => null)
  if (!meta) return null
  const res = await fetch(meta.url, { cache: 'no-store' })
  if (!res.ok) return null
  return { body: Buffer.from(await res.arrayBuffer()), contentType: meta.contentType || res.headers.get('content-type') || 'application/octet-stream', etag: meta.etag }
}

export async function putFile(path: string, body: string | Buffer | Uint8Array, opts: { contentType: string; cacheSeconds?: number }): Promise<{ url: string }> {
  const cache = opts.cacheSeconds ?? 60
  if (r2Configured()) {
    const res = await s3().fetch(objectUrl(path), { method: 'PUT', body: typeof body === 'string' ? body : new Uint8Array(body), headers: { 'Content-Type': opts.contentType, 'Cache-Control': `public, max-age=${cache}` } })
    if (!res.ok) throw new Error(`R2: nu am putut salva ${path} (${res.status})`)
    return { url: mediaUrl(path) }
  }
  const { put } = await import('@vercel/blob')
  const r = await put(path, typeof body === 'string' ? body : Buffer.from(body), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: opts.contentType, cacheControlMaxAge: cache })
  return { url: r.url }
}

export async function getFile(path: string): Promise<StoredFile | null> {
  if (!r2Configured()) return blobRead(path)
  const res = await s3().fetch(objectUrl(path), { method: 'GET' })
  if (res.ok) return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'application/octet-stream', etag: res.headers.get('etag') || '' }
  if (res.status !== 404) throw new Error(`R2: nu am putut citi ${path} (${res.status})`)
  // nu e încă în R2: îl luăm din Blob și îl copiem (o singură dată)
  const old = await blobRead(path).catch(() => null)
  if (old) await putFile(path, old.body, { contentType: old.contentType }).catch(() => {})
  return old
}

export async function getText(path: string): Promise<string | null> {
  const f = await getFile(path)
  return f ? fixBlobUrls(f.body.toString('utf8')) : null
}

export async function fileExists(path: string): Promise<boolean> {
  if (!r2Configured()) {
    if (!blobConfigured()) return false
    const { head } = await import('@vercel/blob')
    return head(path).then(() => true, () => false)
  }
  const res = await s3().fetch(objectUrl(path), { method: 'HEAD' })
  if (res.ok) return true
  return !!(await getFile(path).catch(() => null))
}

export async function listFiles(prefix: string): Promise<string[]> {
  if (!r2Configured()) {
    const { list } = await import('@vercel/blob')
    const out: string[] = []
    let cursor: string | undefined
    do {
      const r = await list({ prefix, cursor, limit: 1000 })
      out.push(...r.blobs.map(b => b.url))
      cursor = r.hasMore ? r.cursor : undefined
    } while (cursor)
    return out
  }
  const out: string[] = []
  let token = ''
  do {
    const u = `${env('S3_ENDPOINT').replace(/\/+$/, '')}/${env('S3_BUCKET')}?list-type=2&prefix=${encodeURIComponent(keyPrefix() + prefix)}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`
    const xml = await (await s3().fetch(u)).text()
    for (const m of Array.from(xml.matchAll(/<Key>([^<]+)<\/Key>/g))) out.push(mediaUrl(decodeXml(m[1]).slice(keyPrefix().length)))
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? decodeXml(xml.match(/<NextContinuationToken>([^<]+)</)?.[1] || '') : ''
  } while (token)
  return out
}
const decodeXml = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")

// căile fișierelor (sau adresele lor publice) → șterse
export async function deleteFiles(pathsOrUrls: string[]): Promise<void> {
  if (!pathsOrUrls.length) return
  if (!r2Configured()) {
    const { del } = await import('@vercel/blob')
    for (let i = 0; i < pathsOrUrls.length; i += 500) await del(pathsOrUrls.slice(i, i + 500))
    return
  }
  const paths = pathsOrUrls.map(pathOf)
  for (const p of paths) await s3().fetch(objectUrl(p), { method: 'DELETE' }).catch(() => null)
}

// adresa publică (/media/… sau Blob) → calea fișierului
export function pathOf(urlOrPath: string): string {
  const m = urlOrPath.match(/\/media\/(.+)$/) || urlOrPath.match(/\.public\.blob\.vercel-storage\.com\/(.+)$/)
  return m ? decodeURIComponent(m[1].split('?')[0]) : urlOrPath.replace(/^\/+/, '')
}

// Pentru baza de date: citire/scriere condiționată (ETag), ca să nu se suprascrie două instanțe
export async function r2GetIfChanged(path: string, etag: string | null): Promise<{ status: 200; body: Buffer; etag: string } | { status: 304 } | { status: 404 }> {
  const res = await s3().fetch(objectUrl(path), { method: 'GET', headers: etag ? { 'If-None-Match': etag } : {} })
  if (res.status === 304) return { status: 304 }
  if (res.status === 404) return { status: 404 }
  if (!res.ok) throw new Error(`R2: nu am putut citi baza de date (${res.status})`)
  return { status: 200, body: Buffer.from(await res.arrayBuffer()), etag: res.headers.get('etag') || '' }
}
export async function r2PutIfMatch(path: string, body: Buffer, etag: string | null): Promise<{ ok: true; etag: string } | { ok: false }> {
  const res = await s3().fetch(objectUrl(path), { method: 'PUT', body: new Uint8Array(body), headers: { 'Content-Type': 'application/octet-stream', ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) } })
  if (res.status === 412) return { ok: false }
  // dacă R2 nu acceptă condiția „să nu existe”, verificăm noi înainte
  if (res.status === 501 && !etag) {
    const h = await s3().fetch(objectUrl(path), { method: 'HEAD' })
    if (h.ok) return { ok: false }
    const r = await s3().fetch(objectUrl(path), { method: 'PUT', body: new Uint8Array(body), headers: { 'Content-Type': 'application/octet-stream' } })
    if (!r.ok) throw new Error(`R2: nu am putut salva baza de date (${r.status})`)
    return { ok: true, etag: r.headers.get('etag') || '' }
  }
  if (!res.ok) throw new Error(`R2: nu am putut salva baza de date (${res.status})`)
  return { ok: true, etag: res.headers.get('etag') || '' }
}
export { blobRead }

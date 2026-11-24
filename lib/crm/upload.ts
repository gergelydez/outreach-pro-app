import { randomBytes } from 'crypto'
import { json, HttpError } from './api'
import { putFile } from '@/lib/object-store'

// Primește o poză (corpul cererii) și o salvează la calea cerută; întoarce adresa publică
export async function storeUpload(req: Request, allowed: (path: string) => boolean): Promise<Response> {
  const u = new URL(req.url)
  const raw = (u.searchParams.get('path') || '').replace(/^\/+/, '')
  if (!raw || raw.includes('..') || !allowed(raw)) throw new HttpError(400, 'Cale invalidă')
  const type = (req.headers.get('content-type') || '').split(';')[0]
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new HttpError(400, 'Doar poze (jpg, png, webp)')
  const body = Buffer.from(await req.arrayBuffer())
  if (!body.length || body.length > 4 * 1024 * 1024) throw new HttpError(413, 'Poza e prea mare')
  const path = raw.replace(/(\.[a-z0-9]+)?$/i, m => `-${randomBytes(4).toString('hex')}${m || '.jpg'}`)
  const { url } = await putFile(path, body, { contentType: type, cacheSeconds: 31536000 })
  return json({ url, pathname: path })
}

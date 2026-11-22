import { describe, it, expect, beforeEach, vi } from 'vitest'

// fără încărcare reală în Blob la salvarea conținutului
vi.mock('@vercel/blob', async orig => ({ ...(await orig<typeof import('@vercel/blob')>()), put: async () => ({ url: 'https://blob.test/x' }) }))
import { freshDb, req } from './helpers'
import { q, one } from '@/lib/crm/db'
import { createPortal } from '@/lib/crm/portal'
import { sendPush } from '@/lib/crm/push'

const withCookie = (path: string, cookie: string, init: { method?: string; json?: unknown } = {}) => {
  const r = req(path, init)
  const h = new Headers(r.headers); h.set('cookie', cookie)
  return new Request(r.url, { method: r.method, headers: h, body: init.json !== undefined ? JSON.stringify(init.json) : undefined })
}
const cookieOf = (res: Response) => (res.headers.get('set-cookie') || '').split(';')[0]

async function setup(name = 'Hanul Izvorul Rece', slug = 'hanul-abc123') {
  const b = await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source, website_status, country, preview_url, stage) VALUES ($1, 'pension', 'Sinaia', 'google_places', 'NO_WEBSITE', 'RO', $2, 'won') RETURNING id`, [name, `https://app.test/p/${slug}`])
  const p = await createPortal(b!.id)
  return { id: b!.id, ...p }
}

describe('client app: accounts linked to the website', () => {
  beforeEach(async () => { process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store_secret'; await freshDb() })

  it('creates an account with the link + code, signs in, and only sees its own business', async () => {
    const { POST: register, GET: inviteInfo } = await import('@/app/api/client/register/route')
    const { POST: login } = await import('@/app/api/client/login/route')
    const { GET: me } = await import('@/app/api/client/me/route')
    const a = await setup()
    const b = await setup('Casa Roxana', 'casa-roxana-1')

    expect(await (await inviteInfo(req(`/api/client/register?token=${a.token}`))).json()).toMatchObject({ name: 'Hanul Izvorul Rece', has_account: false })
    const bad = await register(req('/api/client/register', { method: 'POST', json: { token: a.token, pin: a.pin === '111111' ? '222222' : '111111', email: 'han@x.ro', password: 'parola123' } }))
    expect(bad.status).toBe(401)
    const short = await register(req('/api/client/register', { method: 'POST', json: { token: a.token, pin: a.pin, email: 'han@x.ro', password: 'scurt' } }))
    expect(short.status).toBe(400)
    const ok = await register(req('/api/client/register', { method: 'POST', json: { token: a.token, pin: a.pin, email: 'Han@X.ro', password: 'parola123' } }))
    expect(ok.status).toBe(200)
    const cookie = cookieOf(ok)
    expect(cookie).toMatch(/^client_session=/)
    expect(ok.headers.get('set-cookie')).toMatch(/HttpOnly/)

    const d = await (await me(withCookie('/api/client/me', cookie))).json()
    expect(d.business.name).toBe('Hanul Izvorul Rece')
    expect(d.account.email).toBe('han@x.ro')
    expect(d.vapidPublicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/)
    expect((await me(req('/api/client/me'))).status).toBe(401)
    expect((await me(withCookie('/api/client/me', cookie.replace(/.$/, c => (c === 'a' ? 'b' : 'a'))))).status).toBe(401)

    // același email nu poate fi folosit pentru alt site
    const taken = await register(req('/api/client/register', { method: 'POST', json: { token: b.token, pin: b.pin, email: 'han@x.ro', password: 'parola123' } }))
    expect(taken.status).toBe(409)

    // intrare cu email + parolă; 5 greșeli → blocat
    expect((await login(req('/api/client/login', { method: 'POST', json: { email: 'han@x.ro', password: 'parola123' } }))).status).toBe(200)
    const nobody = await login(req('/api/client/login', { method: 'POST', json: { email: 'nimeni@x.ro', password: 'parola123' } }))
    expect(nobody.status).toBe(401)
    expect((await nobody.json()).error).toBe('no_account')
    for (let i = 0; i < 4; i++) expect((await login(req('/api/client/login', { method: 'POST', json: { email: 'han@x.ro', password: 'gresit' } }))).status).toBe(401)
    expect((await login(req('/api/client/login', { method: 'POST', json: { email: 'han@x.ro', password: 'gresit' } }))).status).toBe(429)
    expect((await login(req('/api/client/login', { method: 'POST', json: { email: 'han@x.ro', password: 'parola123' } }))).status).toBe(429)

    // cod nou de la designer = parolă nouă (și deblocare)
    const again = await createPortal(a.id)
    const reset = await register(req('/api/client/register', { method: 'POST', json: { token: again.token, pin: again.pin, email: 'han@x.ro', password: 'parolanoua9' } }))
    expect(reset.status).toBe(200)
    expect((await login(req('/api/client/login', { method: 'POST', json: { email: 'han@x.ro', password: 'parolanoua9' } }))).status).toBe(200)
    expect(Number((await one<{ n: string }>('SELECT count(*)::text AS n FROM client_accounts'))!.n)).toBe(1)
  })

  it('inbox: new message → push notification; reply via WhatsApp is recorded; other clients cannot touch it', async () => {
    const { POST: register } = await import('@/app/api/client/register/route')
    const { PATCH: patchMsg } = await import('@/app/api/client/messages/route')
    const { PUT: putContent } = await import('@/app/api/client/content/route')
    const { receiveSiteMessage } = await import('@/lib/crm/site-messages')
    const a = await setup()
    const b = await setup('Casa Roxana', 'casa-roxana-1')
    const ca = cookieOf(await register(req('/api/client/register', { method: 'POST', json: { token: a.token, pin: a.pin, email: 'a@x.ro', password: 'parola123' } })))
    const cb = cookieOf(await register(req('/api/client/register', { method: 'POST', json: { token: b.token, pin: b.pin, email: 'b@x.ro', password: 'parola123' } })))

    await q(`INSERT INTO push_subscriptions (business_id, endpoint, keys) VALUES ($1, 'https://push.test/1', '{"p256dh":"k","auth":"a"}'), ($1, 'https://push.test/gone', '{"p256dh":"k","auth":"a"}')`, [a.id])
    const pushed: string[] = []
    const fakeSend = async (sub: { endpoint: string }, payload: string) => { if (sub.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 }); pushed.push(payload) }
    expect(await sendPush(a.id, { title: 'Mesaj nou', body: 'test', url: '/client' }, fakeSend)).toBe(1)
    expect(JSON.parse(pushed[0])).toMatchObject({ title: 'Mesaj nou', url: '/client' })
    expect(Number((await one<{ n: string }>('SELECT count(*)::text AS n FROM push_subscriptions'))!.n)).toBe(1) // cel expirat a fost șters

    await q('DELETE FROM push_subscriptions') // fără trimitere reală în test
    await receiveSiteMessage('hanul-abc123', { name: 'Ana', phone: '0722 000 111', message: 'Aveți loc?' }, '1.1.1.1', async () => {})
    const msg = (await one<{ id: string; status: string }>('SELECT id, status FROM site_messages'))!
    expect(msg.status).toBe('new')
    expect((await patchMsg(withCookie('/api/client/messages', cb, { method: 'PATCH', json: { id: msg.id, status: 'replied', via: 'whatsapp' } }))).status).toBe(200)
    expect((await one<{ status: string }>('SELECT status FROM site_messages'))!.status).toBe('new') // alt client nu poate modifica
    await patchMsg(withCookie('/api/client/messages', ca, { method: 'PATCH', json: { id: msg.id, status: 'replied', via: 'whatsapp' } }))
    expect(await one('SELECT status, replied_via FROM site_messages')).toEqual({ status: 'replied', replied_via: 'whatsapp' })

    const saved = await putContent(withCookie('/api/client/content', ca, { method: 'PUT', json: { content: { prices: [{ name: 'Cameră', price: '300 lei' }] } } }))
    expect(saved.status).toBe(200)
    expect((await one<{ content: { prices: unknown[] } }>('SELECT content FROM client_portals WHERE business_id = $1', [a.id]))!.content.prices).toHaveLength(1)
    expect((await one<{ content: { prices?: unknown[] } }>('SELECT content FROM client_portals WHERE business_id = $1', [b.id]))!.content.prices || []).toHaveLength(0)
  })
})

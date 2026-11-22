// Conturile clienților (panoul site-ului lor): email + parolă, legate de o firmă/un site.
// Sesiune în cookie semnat (HMAC). Secretele (sesiune + chei pentru notificări) se generează o dată
// și stau în baza de date criptată, deci nu trebuie configurat nimic în Vercel.
import { randomBytes, scryptSync, timingSafeEqual, createHmac, generateKeyPairSync } from 'crypto'
import { q, one } from './db'

export const CLIENT_COOKIE = 'client_session'
const SESSION_DAYS = 60

export class ClientAuthError extends Error { constructor(message: string, public status: number) { super(message) } }

interface Secrets { session: string; vapidPublic: string; vapidPrivate: string }

function urlB64(buf: Buffer) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }

// chei VAPID (P-256) pentru Web Push, fără biblioteci externe
function vapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const pubJwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }
  const privJwk = privateKey.export({ format: 'jwk' }) as { d: string }
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pubJwk.x, 'base64url'), Buffer.from(pubJwk.y, 'base64url')])
  return { vapidPublic: urlB64(raw), vapidPrivate: privJwk.d }
}

export async function getSecrets(): Promise<Secrets> {
  const r = await one<{ value: Secrets }>(`SELECT value FROM app_settings WHERE key = 'client_secrets'`)
  if (r?.value?.session && r.value.vapidPublic) return r.value
  const s: Secrets = { session: randomBytes(32).toString('hex'), ...vapidKeys() }
  await q(`INSERT INTO app_settings (key, value, updated_at) VALUES ('client_secrets', $1, now())
           ON CONFLICT (key) DO NOTHING`, [JSON.stringify(s)])
  const again = await one<{ value: Secrets }>(`SELECT value FROM app_settings WHERE key = 'client_secrets'`)
  return again!.value
}

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`
}
export function passwordOk(pw: string, stored: string) {
  const [salt, hex] = stored.split(':')
  if (!salt || !hex) return false
  const a = scryptSync(pw, salt, 32)
  const b = Buffer.from(hex, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 160
export const validPassword = (p: string) => p.length >= 8 && p.length <= 200

export async function sessionCookie(accountId: string, now = Date.now()) {
  const { session } = await getSecrets()
  const exp = now + SESSION_DAYS * 86400_000
  const sig = createHmac('sha256', session).update(`${accountId}.${exp}`).digest('hex')
  return `${CLIENT_COOKIE}=${accountId}.${exp}.${sig}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`
}
export const clearCookie = () => `${CLIENT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`

function readCookie(req: Request): string {
  const raw = req.headers.get('cookie') || ''
  const m = raw.split(/;\s*/).find(c => c.startsWith(`${CLIENT_COOKIE}=`))
  return m ? decodeURIComponent(m.slice(CLIENT_COOKIE.length + 1)) : ''
}

export interface ClientAccount { id: string; business_id: string; email: string; name: string; country: string; preview_url: string | null; live_url: string | null }

export async function requireClient(req: Request): Promise<ClientAccount> {
  const [id, exp, sig] = readCookie(req).split('.')
  if (!id || !exp || !sig || Number(exp) < Date.now()) throw new ClientAuthError('not signed in', 401)
  const { session } = await getSecrets()
  const good = createHmac('sha256', session).update(`${id}.${exp}`).digest('hex')
  if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) throw new ClientAuthError('not signed in', 401)
  const a = await one<ClientAccount>(`SELECT a.id, a.business_id, a.email, b.name, b.country, b.preview_url, b.live_url
      FROM client_accounts a JOIN businesses b ON b.id = a.business_id WHERE a.id = $1`, [id])
  if (!a) throw new ClientAuthError('not signed in', 401)
  return a
}

// Contul se creează (sau parola se resetează) cu linkul + codul primite de la designer
export async function registerAccount(businessId: string, email: string, password: string) {
  email = email.trim().toLowerCase()
  if (!validEmail(email)) throw new ClientAuthError('email', 400)
  if (!validPassword(password)) throw new ClientAuthError('password', 400)
  const other = await one<{ business_id: string }>('SELECT business_id FROM client_accounts WHERE email = $1', [email])
  if (other && other.business_id !== businessId) throw new ClientAuthError('email_taken', 409)
  const row = await one<{ id: string }>(`INSERT INTO client_accounts (business_id, email, password_hash) VALUES ($1, $2, $3)
      ON CONFLICT (business_id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, failed_attempts = 0, locked_until = NULL
      RETURNING id`, [businessId, email, hashPassword(password)])
  return row!.id
}

// 5 parole greșite → blocat 15 minute
export async function login(email: string, password: string) {
  const a = await one<{ id: string; password_hash: string; failed_attempts: number; locked_until: string | null }>(
    'SELECT id, password_hash, failed_attempts, locked_until FROM client_accounts WHERE email = $1', [email.trim().toLowerCase()])
  if (!a) throw new ClientAuthError('wrong', 401)
  if (a.locked_until && new Date(a.locked_until).getTime() > Date.now()) throw new ClientAuthError('locked', 429)
  if (!passwordOk(password, a.password_hash)) {
    const fails = a.failed_attempts + 1
    if (fails >= 5) await q(`UPDATE client_accounts SET failed_attempts = 0, locked_until = now() + interval '15 minutes' WHERE id = $1`, [a.id])
    else await q('UPDATE client_accounts SET failed_attempts = $2 WHERE id = $1', [a.id, fails])
    throw new ClientAuthError(fails >= 5 ? 'locked' : 'wrong', fails >= 5 ? 429 : 401)
  }
  await q('UPDATE client_accounts SET failed_attempts = 0, last_login_at = now() WHERE id = $1', [a.id])
  return a.id
}

export async function changePassword(accountId: string, current: string, next: string) {
  const a = await one<{ password_hash: string }>('SELECT password_hash FROM client_accounts WHERE id = $1', [accountId])
  if (!a || !passwordOk(current, a.password_hash)) throw new ClientAuthError('wrong', 401)
  if (!validPassword(next)) throw new ClientAuthError('password', 400)
  await q('UPDATE client_accounts SET password_hash = $2 WHERE id = $1', [accountId, hashPassword(next)])
}

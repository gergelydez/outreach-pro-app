// Sesiune semnată (HMAC-SHA256) pentru zona CRM, compatibilă Edge (middleware) și Node.
// Un singur utilizator (proprietarul), autentificat cu CRM_PASSWORD.

export const SESSION_COOKIE = 'crm_session'
export const SESSION_DAYS = 14

function secret(): string {
  return process.env.CRM_SESSION_SECRET || (process.env.CRM_PASSWORD ? `pw:${process.env.CRM_PASSWORD}` : '')
}

async function hmac(data: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createSession(now = Date.now()): Promise<string> {
  const exp = now + SESSION_DAYS * 86400_000
  return `${exp}.${await hmac(`crm:${exp}`, secret())}`
}

export async function verifySession(token: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!token || !secret()) return false
  const [expStr, sig] = token.split('.')
  const exp = Number(expStr)
  if (!exp || exp < now || !sig) return false
  return safeEqual(sig, await hmac(`crm:${exp}`, secret()))
}

export async function checkPassword(input: string): Promise<boolean> {
  const pw = process.env.CRM_PASSWORD
  if (!pw) return false
  // comparăm hash-urile, ca durata să nu depindă de lungimea parolei
  return safeEqual(await hmac(input, 'pw-check'), await hmac(pw, 'pw-check'))
}

export function workerTokenOk(header: string | null): boolean {
  const t = process.env.CRM_WORKER_TOKEN
  if (!t || !header) return false
  return safeEqual(header.replace(/^Bearer\s+/i, ''), t)
}

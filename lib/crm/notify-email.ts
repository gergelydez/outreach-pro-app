// Emailul de notificare al clientului: îl scrie singur în aplicație, primește un cod de 6 cifre pe acel email,
// iar după confirmare mesajele din formular vin și pe email. Se poate schimba sau opri oricând.
import { randomBytes } from 'crypto'
import { q, one } from './db'
import { hashPassword, passwordOk, validEmail, ClientAuthError } from './client-auth'
import { resendSend } from './site-messages'

export const emailAvailable = () => !!process.env.RESEND_API_KEY && !!process.env.FORM_FROM_EMAIL

type Send = (mail: { to: string; subject: string; text: string }) => Promise<void>

const L = {
  ro: { subject: (c: string) => `Codul tău de confirmare: ${c}`, text: (c: string) => `Codul pentru confirmarea emailului de notificare este: ${c}\n\nCodul e valabil 15 minute. Dacă nu ai cerut tu acest cod, ignoră emailul.` },
  hu: { subject: (c: string) => `Megerősítő kód: ${c}`, text: (c: string) => `Az értesítési e-mail megerősítő kódja: ${c}\n\nA kód 15 percig érvényes. Ha nem Ön kérte, hagyja figyelmen kívül ezt az e-mailt.` },
  en: { subject: (c: string) => `Your confirmation code: ${c}`, text: (c: string) => `Your code to confirm the notification email is: ${c}\n\nThe code is valid for 15 minutes. If you did not ask for it, ignore this email.` },
}
const langOf = (country: string) => (country === 'HU' ? 'hu' : country === 'UK' ? 'en' : 'ro')

export async function requestEmailCode(accountId: string, email: string, send: Send = resendSend) {
  email = email.trim().toLowerCase()
  if (!validEmail(email)) throw new ClientAuthError('email', 400)
  if (!emailAvailable() && send === resendSend) throw new ClientAuthError('email_unavailable', 503)
  const a = await one<{ notify_code_sent_at: string | null; country: string }>(`SELECT a.notify_code_sent_at, b.country FROM client_accounts a JOIN businesses b ON b.id = a.business_id WHERE a.id = $1`, [accountId])
  if (!a) throw new ClientAuthError('not signed in', 401)
  if (a.notify_code_sent_at && Date.now() - new Date(a.notify_code_sent_at).getTime() < 60_000) throw new ClientAuthError('wait', 429)
  const code = String(100000 + (randomBytes(4).readUInt32BE(0) % 900000))
  const t = L[langOf(a.country)]
  await send({ to: email, subject: t.subject(code), text: t.text(code) })
  await q(`UPDATE client_accounts SET notify_pending_email = $2, notify_code_hash = $3, notify_code_expires = now() + interval '15 minutes',
             notify_code_sent_at = now(), notify_code_attempts = 0 WHERE id = $1`, [accountId, email, hashPassword(code)])
}

export async function confirmEmailCode(accountId: string, code: string) {
  const a = await one<{ notify_pending_email: string | null; notify_code_hash: string | null; notify_code_expires: string | null; notify_code_attempts: number }>(
    'SELECT notify_pending_email, notify_code_hash, notify_code_expires, notify_code_attempts FROM client_accounts WHERE id = $1', [accountId])
  if (!a?.notify_pending_email || !a.notify_code_hash || !a.notify_code_expires || new Date(a.notify_code_expires).getTime() < Date.now()) throw new ClientAuthError('expired', 410)
  if (a.notify_code_attempts >= 5) throw new ClientAuthError('expired', 410)
  if (!/^\d{6}$/.test(code) || !passwordOk(code, a.notify_code_hash)) {
    await q('UPDATE client_accounts SET notify_code_attempts = notify_code_attempts + 1 WHERE id = $1', [accountId])
    throw new ClientAuthError('wrong_code', 401)
  }
  await q(`UPDATE client_accounts SET notify_email = notify_pending_email, notify_pending_email = NULL, notify_code_hash = NULL, notify_code_expires = NULL WHERE id = $1`, [accountId])
  return a.notify_pending_email
}

export async function disableEmail(accountId: string) {
  await q('UPDATE client_accounts SET notify_email = NULL, notify_pending_email = NULL, notify_code_hash = NULL, notify_code_expires = NULL WHERE id = $1', [accountId])
}

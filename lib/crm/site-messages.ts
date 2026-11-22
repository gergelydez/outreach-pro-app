// Mesajele din formularul site-ului: salvate (le vede clientul în panou) și trimise pe email prin Resend.
// Emailul pleacă de la FORM_FROM_EMAIL (domeniul tău, verificat în Resend), cu Reply-To = vizitatorul.
import { createHash } from 'crypto'
import { q, one } from './db'
import { sanitizeContent } from './cms-shared'
import { sendPush } from './push'

export interface SiteMessageInput { name?: unknown; email?: unknown; phone?: unknown; message?: unknown; checkin?: unknown; checkout?: unknown; guests?: unknown; website?: unknown }
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export class MessageError extends Error { constructor(message: string, public status: number) { super(message) } }

type Sender = (mail: { to: string; replyTo?: string; subject: string; text: string }) => Promise<void>

export async function resendSend(mail: { to: string; replyTo?: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY
  const from = process.env.FORM_FROM_EMAIL
  if (!key || !from) throw new Error('email not configured (RESEND_API_KEY / FORM_FROM_EMAIL)')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [mail.to], reply_to: mail.replyTo || undefined, subject: mail.subject, text: mail.text }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

const L = {
  ro: { subject: 'Mesaj nou de pe site', name: 'Nume', phone: 'Telefon', email: 'Email', checkin: 'Sosire', checkout: 'Plecare', guests: 'Persoane', message: 'Mesaj', foot: 'Răspundeți direct la acest email ca să-i scrieți vizitatorului. Mesajul se găsește și în panoul de administrare al site-ului.' },
  hu: { subject: 'Új üzenet a weboldalról', name: 'Név', phone: 'Telefon', email: 'E-mail', checkin: 'Érkezés', checkout: 'Távozás', guests: 'Fő', message: 'Üzenet', foot: 'Erre az e-mailre válaszolva közvetlenül a látogatónak ír. Az üzenet a weboldal kezelőfelületén is megtalálható.' },
  en: { subject: 'New message from your website', name: 'Name', phone: 'Phone', email: 'Email', checkin: 'Check-in', checkout: 'Check-out', guests: 'Guests', message: 'Message', foot: 'Reply to this email to answer the visitor directly. The message is also in your website admin panel.' },
}

export async function receiveSiteMessage(slug: string, input: SiteMessageInput, ip: string, send: Sender = resendSend) {
  if (s(input.website, 200)) return { ok: true, spam: true } // câmp ascuns completat doar de roboți
  const b = await one<{ id: string; name: string; country: string; email: string | null }>(
    `SELECT id, name, country, email FROM businesses WHERE preview_url LIKE $1 LIMIT 1`, [`%/p/${slug}`])
  if (!b) throw new MessageError('not found', 404)
  const m = { name: s(input.name, 120), email: s(input.email, 160), phone: s(input.phone, 40), message: s(input.message, 3000) }
  const extra = { checkin: s(input.checkin, 20), checkout: s(input.checkout, 20), guests: s(input.guests, 20) }
  if (!m.message && !m.phone && !m.email) throw new MessageError('empty', 400)
  if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) m.email = ''
  const ipHash = createHash('sha256').update(`${ip}|${b.id}`).digest('hex').slice(0, 32)
  const recent = await one<{ ip: string; all: string }>(`SELECT count(*) FILTER (WHERE ip_hash = $2)::text AS ip, count(*)::text AS all FROM site_messages WHERE business_id = $1 AND created_at > now() - interval '1 hour'`, [b.id, ipHash])
  if (Number(recent?.ip || 0) >= 5 || Number(recent?.all || 0) >= 30) throw new MessageError('too many', 429)

  const row = await one<{ id: string }>(`INSERT INTO site_messages (business_id, name, email, phone, message, extra, ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [b.id, m.name, m.email, m.phone, m.message, JSON.stringify(extra), ipHash])
  // destinatarul: emailul din panoul clientului (îl poate schimba singur), altfel cel din CRM
  const portal = await one<{ content: unknown }>('SELECT content FROM client_portals WHERE business_id = $1', [b.id])
  const to = sanitizeContent(portal?.content).contact.email || b.email || ''
  const t = L[b.country === 'HU' ? 'hu' : b.country === 'UK' ? 'en' : 'ro']
  const lines = [
    m.name && `${t.name}: ${m.name}`, m.phone && `${t.phone}: ${m.phone}`, m.email && `${t.email}: ${m.email}`,
    extra.checkin && `${t.checkin}: ${extra.checkin}`, extra.checkout && `${t.checkout}: ${extra.checkout}`, extra.guests && `${t.guests}: ${extra.guests}`,
    m.message && `\n${t.message}:\n${m.message}`, `\n—\n${t.foot}`,
  ].filter(Boolean).join('\n')
  let emailed = false; let error = ''
  if (!to) error = 'no recipient email'
  else {
    try { await send({ to, replyTo: m.email || undefined, subject: `${t.subject} · ${b.name}${m.name ? ` · ${m.name}` : ''}`, text: lines }); emailed = true }
    catch (e) { error = e instanceof Error ? e.message : String(e) }
  }
  await q('UPDATE site_messages SET emailed = $2, email_error = $3 WHERE id = $1', [row!.id, emailed, error ? error.slice(0, 300) : null])
  await sendPush(b.id, { title: `${t.subject} · ${m.name || m.phone || m.email}`, body: (m.message || [extra.checkin, extra.checkout].filter(Boolean).join(' → ') || '').slice(0, 140), url: '/client' }).catch(() => 0)
  return { ok: true, emailed }
}

export async function listSiteMessages(businessId: string, limit = 50) {
  return q<{ id: string; name: string; email: string; phone: string; message: string; extra: Record<string, string> | null; emailed: boolean; status: string; replied_via: string | null; created_at: string }>(
    'SELECT id, name, email, phone, message, extra, emailed, status, replied_via, created_at FROM site_messages WHERE business_id = $1 ORDER BY created_at DESC LIMIT $2', [businessId, limit])
}

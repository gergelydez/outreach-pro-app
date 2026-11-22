// Notificări pe telefon (Web Push) pentru panoul clientului: „Mesaj nou de pe site”.
// Funcționează în Chrome/Android și pe iPhone când panoul e instalat pe ecranul principal.
import { q } from './db'
import { getSecrets } from './client-auth'

export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }

export async function saveSubscription(businessId: string, sub: PushSub) {
  if (!/^https:\/\//.test(sub?.endpoint || '') || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('invalid subscription')
  await q(`INSERT INTO push_subscriptions (business_id, endpoint, keys) VALUES ($1, $2, $3)
           ON CONFLICT (endpoint) DO UPDATE SET business_id = EXCLUDED.business_id, keys = EXCLUDED.keys`, [businessId, sub.endpoint, JSON.stringify(sub.keys)])
}

export async function removeSubscription(businessId: string, endpoint: string) {
  await q('DELETE FROM push_subscriptions WHERE business_id = $1 AND endpoint = $2', [businessId, endpoint])
}

type Sender = (sub: PushSub, payload: string, opts: { vapidDetails: { subject: string; publicKey: string; privateKey: string }; TTL: number; timeout: number }) => Promise<unknown>

export async function sendPush(businessId: string, msg: { title: string; body: string; url: string }, send?: Sender) {
  const subs = await q<{ endpoint: string; keys: PushSub['keys'] }>('SELECT endpoint, keys FROM push_subscriptions WHERE business_id = $1', [businessId])
  if (!subs.length) return 0
  const s = await getSecrets()
  const sender: Sender = send || (async (sub, payload, opts) => (await import('web-push')).default.sendNotification(sub, payload, opts))
  let sent = 0
  for (const sub of subs) {
    try {
      await sender({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(msg), {
        vapidDetails: { subject: 'mailto:notificari@glamx.ro', publicKey: s.vapidPublic, privateKey: s.vapidPrivate }, TTL: 86400, timeout: 10_000,
      })
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await removeSubscription(businessId, sub.endpoint) // abonament expirat
    }
  }
  return sent
}

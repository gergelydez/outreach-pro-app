// Verificări UK GDPR / PECR înainte de a pregăti sau marca un contact.
// Nu e consultanță juridică: aplicația doar semnalează riscurile; decizia îți aparține.
//
// PECR, pe scurt (ICO): email/SMS de marketing nesolicitat către „corporate
// subscribers” (Ltd, LLP, plc, organizații publice) e permis dacă te identifici și
// oferi opt-out. Către „individual subscribers” (persoane fizice autorizate, parteneriate
// fără personalitate juridică) ai nevoie de consimțământ prealabil (soft opt-in nu se
// aplică unui prospect nou). Apelurile telefonice: verifică TPS/CTPS înainte.
// WhatsApp e tratat ca mesaj electronic, la fel ca SMS-ul.

export type Channel = 'email' | 'whatsapp' | 'contact_form' | 'linkedin' | 'phone'
export interface ComplianceInput {
  channel: Channel
  subscriberType: 'corporate' | 'sole_trader' | 'unknown' | string
  suppressed: boolean
  lawfulBasis?: string | null
}
export interface ComplianceResult { allowed: boolean; level: 'ok' | 'warning' | 'blocked'; messages: string[] }

export function checkContact(i: ComplianceInput): ComplianceResult {
  if (i.suppressed) return { allowed: false, level: 'blocked', messages: ['This business is on your suppression list (opted out or asked not to be contacted). Do not contact.'] }
  const msgs: string[] = []
  const electronic = i.channel === 'email' || i.channel === 'whatsapp'
  if (electronic) {
    if (i.subscriberType === 'corporate') msgs.push('Corporate subscriber: unsolicited B2B email is generally allowed under PECR if you identify yourself and include a simple way to opt out.')
    else if (i.subscriberType === 'sole_trader') msgs.push('Sole trader / partnership: PECR treats them as individual subscribers — you need their prior consent before sending marketing by email or WhatsApp. Prefer a phone call (after a TPS check) or their contact form.')
    else msgs.push('Subscriber type unknown: check Companies House. If it is not a limited company, treat it as an individual subscriber (consent needed for marketing email/WhatsApp).')
    if (!i.lawfulBasis) msgs.push('Record your lawful basis (e.g. legitimate interests assessment) before contacting.')
  }
  if (i.channel === 'phone') msgs.push('Screen the number against TPS/CTPS before a marketing call, and record the outcome.')
  if (i.channel === 'contact_form') msgs.push('Contact forms are provided by the business for enquiries; keep the message relevant, short and identify yourself.')
  const warn = (electronic && (i.subscriberType !== 'corporate' || !i.lawfulBasis)) || i.channel === 'phone'
  return { allowed: true, level: warn ? 'warning' : 'ok', messages: msgs }
}

export const OPT_OUT_LINE = 'If you would rather not hear from me again, just reply "no thanks" and I will not contact you again.'

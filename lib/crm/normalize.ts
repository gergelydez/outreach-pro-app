// Normalizări folosite la deduplicare: telefon UK în E.164, domeniu, nume, cod poștal.

// Telefon UK → +44XXXXXXXXXX. Întoarce null dacă nu pare un număr britanic valid.
export function normalizeUkPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('44')) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  if (!/^\d{9,10}$/.test(d)) return null
  return `+44${d}`
}

// Mobil UK = 07xxx (după +44 începe cu 7). Fixe: 01/02/03.
export function ukPhoneType(e164: string | null): 'mobile' | 'landline' | 'unknown' {
  if (!e164 || !e164.startsWith('+44')) return 'unknown'
  const n = e164.slice(3)
  if (n.startsWith('7')) return 'mobile'
  if (/^[123]/.test(n)) return 'landline'
  return 'unknown'
}

export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

const NAME_NOISE = /\b(ltd|limited|llp|plc|co|company|services?|the|and|&)\b/g
export function normalizeName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9& ]/g, ' ').replace(NAME_NOISE, ' ').replace(/\s+/g, ' ').trim()
}

// Cod poștal UK (ex. B15 2TT, WV1 1AA) din adresă
const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i
export function extractUkPostcode(address: string | null | undefined): string | null {
  const m = (address || '').match(POSTCODE_RE)
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null
}

export function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  return crypto.subtle.digest('SHA-256', data).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
}

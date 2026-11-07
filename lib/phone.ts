// Mobil sau fix, după prefix. WhatsApp există practic doar pe numere mobile,
// deci un fix (02x/03x în RO) se sună sau se contactează pe email.
// Nu verifică dacă numărul chiar are WhatsApp — asta se vede doar deschizând chatul.

export type PhoneType = 'mobile' | 'landline' | 'unknown'

export function phoneType(intlDigits: string): PhoneType {
  const d = (intlDigits || '').replace(/\D/g, '')
  if (d.startsWith('40')) return d[2] === '7' ? 'mobile' : /^[23]/.test(d.slice(2)) ? 'landline' : 'unknown'
  if (d.startsWith('36')) return /^(20|30|31|50|70)/.test(d.slice(2)) ? 'mobile' : d.length > 2 ? 'landline' : 'unknown'
  return 'unknown'
}

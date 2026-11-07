import { NextRequest, NextResponse } from 'next/server'
import { slugify } from '@/lib/preview'

export const maxDuration = 20

// Afacerile „fără site” din Google Maps au uneori totuși un site, doar că nu e
// trecut în profil. Încercăm domeniile cele mai probabile (nume.ro, nume.com)
// și raportăm doar pe cele care răspund și conțin numele afacerii.

const GENERIC = new Set(['pensiunea', 'pensiune', 'cabana', 'casa', 'vila', 'hotel', 'salon', 'cabinet', 'clinica',
  'stomatologic', 'medical', 'veterinar', 'service', 'auto', 'restaurant', 'srl', 'pfa', 'ii', 'si', 'de', 'la', 'the'])

function candidates(name: string, city: string): string[] {
  const full = slugify(name)
  const core = full.split('-').filter(w => !GENERIC.has(w)).join('-')
  const out = new Set<string>()
  for (const base of [full, core, full.replace(/-/g, ''), core.replace(/-/g, '')]) {
    if (base.length >= 4) { out.add(`${base}.ro`); out.add(`${base}.com`) }
  }
  if (core.length >= 3) out.add(`${core}-${slugify(city)}.ro`)
  return Array.from(out).slice(0, 6)
}

// cuvântul cel mai distinctiv din nume, după care recunoaștem pagina
function token(name: string): string {
  return slugify(name).split('-').filter(w => !GENERIC.has(w) && w.length >= 4).sort((a, b) => b.length - a.length)[0] || ''
}

export async function POST(req: NextRequest) {
  const { name = '', city = '' } = await req.json()
  const tok = token(name)
  const list = candidates(name, city)
  const results = await Promise.all(list.map(async domain => {
    try {
      const res = await fetch(`https://${domain}`, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OutreachProAudit/1.0)' },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return null
      const html = (await res.text()).slice(0, 200_000)
      const plain = slugify(html.replace(/<[^>]+>/g, ' ')).replace(/-/g, ' ')
      if (/domain (is )?for sale|parked|domeniu de vanzare|this domain|cumpara acest domeniu/i.test(html.slice(0, 20000))) return null
      if (tok && !plain.includes(tok)) return null
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || domain
      return { url: res.url || `https://${domain}`, title: title.slice(0, 120) }
    } catch { return null }
  }))
  return NextResponse.json({ checked: list, found: results.filter(Boolean) })
}

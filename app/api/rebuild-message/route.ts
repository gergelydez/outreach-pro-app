import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { friendlyAnthropicError } from '@/lib/anthropic-error'
import { HU_CITIES } from '@/lib/constants'
import type { RebuildLead } from '@/lib/rebuild'
import { auditPitches } from '@/lib/pitch'

export const maxDuration = 60

// Mesaj scurt, personal: pornește de la 1-2 observații concrete din audit (ce
// vede un client pe site-ul lor), apoi conceptul — fără presiune.

export async function POST(req: NextRequest) {
  const { lead, channel = 'whatsapp', points, seasonHook = '', promo = '', anthropicApiKey: clientKey, senderName = '', yourPhone = '', yourWebsite = '' }:
    { lead: RebuildLead; channel?: 'whatsapp' | 'email'; points?: string[]; seasonHook?: string; promo?: string; anthropicApiKey?: string; senderName?: string; yourPhone?: string; yourWebsite?: string } =
    await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY || clientKey
  if (!apiKey) return NextResponse.json({ error: 'Lipsă Anthropic API key (Setări)' }, { status: 400 })

  const name = process.env.SENDER_NAME || senderName
  const isHU = HU_CITIES.includes(lead.city.replace(' 🏘️', '').trim())
  const observations = (points?.length ? points : auditPitches(lead.audit?.issues).slice(0, 2))

  const prompt = `Scrie un mesaj de prim contact ${channel === 'email' ? 'pe email (cu subiect)' : 'pe WhatsApp'} în limba ${isHU ? 'maghiară' : 'română'}, de la un web designer către o afacere locală.

Context:
- Afacerea: ${lead.name} (${lead.category_label}, ${lead.city.replace(' 🏘️', '')})
- Site-ul lor actual: ${lead.no_site ? 'NU au site propriu (le-am construit primul site)' : lead.website}
- Ce am observat concret ${lead.no_site ? 'despre prezența lor online' : 'la site-ul actual'} (verificat, formulat pentru client):
${observations.length ? observations.map(o => `  • ${o}`).join('\n') : '  • designul arată învechit față de cât de bine lucrează'}
${seasonHook ? `- Context de sezon (adevărat, verificat): ${seasonHook}\n` : ''}${promo ? `- Ofertă reală, valabilă acum: ${promo}\n` : ''}- Am construit deja un concept ${lead.no_site ? 'pentru primul lor site' : 'modern al site-ului lor'}, live aici: ${lead.preview_url || '[LINK PREVIEW]'}
- Expeditor: ${name || '[numele meu]'}${yourPhone ? `, tel ${yourPhone}` : ''}${yourWebsite ? `, ${yourWebsite}` : ''}
${lead.rating >= 4.3 && lead.reviews_count >= 20 ? `- Au ${lead.rating}★ din ${lead.reviews_count} recenzii Google — se vede că lucrează bine` : ''}

Reguli:
- Scurt: ${channel === 'email' ? 'max 90 de cuvinte în corp' : 'max 5 rânduri scurte'}. Pe tonul unui om real, nu al unei agenții.
- Structura: salut → cine sunt într-o jumătate de frază → ${lead.no_site ? `am dat de ${lead.name} pe Google și am observat că nu au site (observațiile de mai sus, ca un semnal util) → de aceea le-am făcut un concept de site` : `ce am observat la site-ul ${lead.name} (observațiile de mai sus, ca un semnal util, cu efectul asupra clienților lor) → de aceea am făcut un concept modern care rezolvă asta`} → linkul → „fără nicio obligație".
- Observațiile sunt verificate: folosește-le fidel, fără să le exagerezi și fără să adaugi altele. Ton de coleg care dă un pont, nu de critic — niciodată jignitor sau alarmist.
${promo ? '- Menționează oferta O SINGURĂ dată, într-o propoziție simplă după link (ex. „Dacă vă place, ...”), exact cu prețul și data de mai sus. Fără „grăbiți-vă”, fără presiune, fără emoji excesive (max 1), fără majuscule de marketing.' : '- FĂRĂ preț, fără „ofertă limitată", fără presiune, fără emoji excesive (max 1), fără majuscule de marketing.'}
${seasonHook ? '- Poți lega observațiile de contextul de sezon într-o jumătate de frază, natural.' : ''}
- Ultima propoziție: o variantă politicoasă de „dacă nu vă interesează, îmi spuneți și nu vă mai deranjez".
- Nu inventa nimic despre afacere.`

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { subject: { type: 'string' }, message: { type: 'string' } },
            required: ['subject', 'message'],
            additionalProperties: false,
          },
        },
      },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    })
    if (msg.stop_reason === 'refusal') throw new Error('Modelul a refuzat cererea')
    const lastFallback = msg.content.map(b => b.type).lastIndexOf('fallback')
    const text = msg.content.slice(lastFallback + 1).map(b => (b.type === 'text' ? b.text : '')).join('')
    const out = JSON.parse(text) as { subject: string; message: string }
    return NextResponse.json({ subject: channel === 'email' ? out.subject : '', message: out.message.trim() })
  } catch (err) {
    return NextResponse.json({ error: friendlyAnthropicError(err, process.env.ANTHROPIC_API_KEY ? 'env' : 'settings') }, { status: 500 })
  }
}

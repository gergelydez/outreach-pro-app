import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { HU_CITIES } from '@/lib/constants'
import type { RebuildLead } from '@/lib/rebuild'

export const maxDuration = 60

// Mesaj scurt, personal, fără presiune: „am făcut un concept, uite linkul".

export async function POST(req: NextRequest) {
  const { lead, channel = 'whatsapp', anthropicApiKey: clientKey, senderName = '', yourPhone = '', yourWebsite = '' }:
    { lead: RebuildLead; channel?: 'whatsapp' | 'email'; anthropicApiKey?: string; senderName?: string; yourPhone?: string; yourWebsite?: string } =
    await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY || clientKey
  if (!apiKey) return NextResponse.json({ error: 'Lipsă Anthropic API key (Setări)' }, { status: 400 })

  const name = process.env.SENDER_NAME || senderName
  const isHU = HU_CITIES.includes(lead.city.replace(' 🏘️', '').trim())
  const issues = lead.audit?.issues.slice(0, 4).join('; ') || ''

  const prompt = `Scrie un mesaj de prim contact ${channel === 'email' ? 'pe email (cu subiect)' : 'pe WhatsApp'} în limba ${isHU ? 'maghiară' : 'română'}, de la un web designer către o afacere locală.

Context:
- Afacerea: ${lead.name} (${lead.category_label}, ${lead.city.replace(' 🏘️', '')})
- Site-ul lor actual: ${lead.website}
- Ce am observat la site-ul actual: ${issues || 'design învechit'}
- Am construit deja un concept modern al site-ului lor, live aici: ${lead.preview_url || '[LINK PREVIEW]'}
- Expeditor: ${name || '[numele meu]'}${yourPhone ? `, tel ${yourPhone}` : ''}${yourWebsite ? `, ${yourWebsite}` : ''}
${lead.rating >= 4.3 && lead.reviews_count >= 20 ? `- Au ${lead.rating}★ din ${lead.reviews_count} recenzii Google — se vede că lucrează bine` : ''}

Reguli:
- Scurt: ${channel === 'email' ? 'max 90 de cuvinte în corp' : 'max 5 rânduri scurte'}. Pe tonul unui om real, nu al unei agenții.
- Structura: salut → cine sunt într-o jumătate de frază → am făcut un concept modern pentru site-ul ${lead.name} → linkul → „fără nicio obligație, m-am gândit că v-ar plăcea să-l vedeți".
- Poți menționa O SINGURĂ problemă concretă a site-ului actual, formulată respectuos (ex. „pe telefon e greu de citit"), niciodată jignitor.
- FĂRĂ preț, fără „ofertă limitată", fără presiune, fără emoji excesive (max 1), fără majuscule de marketing.
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
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

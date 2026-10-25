import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { HU_CITIES } from '@/lib/constants'
import type { RebuildLead } from '@/lib/rebuild'

// Generarea unui site complet durează 1-4 minute
export const maxDuration = 300

// Răspuns NDJSON: {t:'progress',chars} … apoi {t:'done',html} sau {t:'error',error}.
// Trimitem progresul pe parcurs ca să nu pară blocat, HTML-ul final la sfârșit.

export async function POST(req: NextRequest) {
  const { lead, anthropicApiKey: clientKey, extraInstructions = '' }:
    { lead: RebuildLead; anthropicApiKey?: string; extraInstructions?: string } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY || clientKey
  if (!apiKey) return Response.json({ error: 'Lipsă Anthropic API key (Setări)' }, { status: 400 })
  if (!lead.audit) return Response.json({ error: 'Rulează mai întâi auditul site-ului' }, { status: 400 })

  const a = lead.audit
  const lang = HU_CITIES.includes(lead.city.replace(' 🏘️', '').trim()) ? 'maghiară' : 'română'
  const tel = (a.phones[0] || lead.phone || '').replace(/\s/g, '')
  const hasRating = lead.rating >= 4.0 && lead.reviews_count >= 10

  const prompt = `Ești un web designer senior. Refă site-ul unei afaceri locale reale ca un concept modern, single-file HTML, pe care îl vom arăta proprietarului ca preview: „uite cum ar putea arăta site-ul vostru".

AFACEREA
- Nume: ${lead.name}
- Domeniu: ${lead.category_label}
- Oraș / adresă: ${lead.address || lead.city}
- Telefon: ${a.phones[0] || lead.phone || '—'}
- Email: ${a.emails[0] || '—'}
- Site actual: ${a.final_url}
${hasRating ? `- Google: ${lead.rating}★ din ${lead.reviews_count} recenzii (date reale, le poți afișa exact așa)` : ''}
${a.socials.length ? `- Social: ${a.socials.join(', ')}` : ''}

CONȚINUTUL REAL DE PE SITE-UL ACTUAL (sursa ta de adevăr)
Titlu: ${a.title || '—'}
Descriere: ${a.description || '—'}
Titluri de secțiuni: ${a.headings.join(' | ') || '—'}
Text:
"""
${a.text_excerpt || '(site-ul nu a putut fi citit — folosește doar datele de mai sus)'}
"""
${a.logo_url ? `Logo: ${a.logo_url}` : ''}
${a.images.length ? `Imagini proprii de pe site (folosește-le cu <img src> unde se potrivesc, cu object-fit:cover și fundal de rezervă dacă nu se încarcă): ${a.images.join(' , ')}` : ''}

PROBLEMELE SITE-ULUI ACTUAL (rezolvă-le vizibil în concept)
${a.issues.map(i => `- ${i}`).join('\n') || '- design învechit'}

CE CONSTRUIEȘTI
- Structură potrivită domeniului: hero clar cu ce fac și unde, serviciile LOR reale (din textul de mai sus), de ce ei, ${hasRating ? 'dovada socială cu ratingul Google real, ' : ''}program/locație dacă apar în text, contact cu telefon clickabil (href="tel:${tel}") și, dacă e cazul, buton de programare / cerere ofertă.
- Design 2026, nu template: tipografie bună (poți folosi Google Fonts), paletă derivată din domeniu și din identitatea lor actuală, spațiere generoasă, mobile-first, animații subtile la scroll, navigație sticky care pe mobil devine meniu.
- Tot conținutul în limba ${lang}, cu diacritice corecte. Ton profesionist, cald, specific afacerii lor.
- Un singur fișier: CSS în <style>, JS minimal în <script>. Fără framework-uri.
- Fără imagini stock inventate; unde nu ai poze proprii folosește compoziții CSS (gradiente, forme, iconițe SVG inline).

ONESTITATE — OBLIGATORIU
- NU inventa fapte: prețuri, ani de experiență, număr de clienți, certificări, nume de angajați, premii. Dacă nu apar în text, nu le pune.
- NU inventa recenzii sau testimoniale cu nume. Dacă vrei o secțiune de testimoniale, pune ${hasRating ? 'ratingul Google real și ' : ''}un card discret „Aici apar recenziile voastre reale de pe Google".
- Formularele nu trimit nicăieri: la submit afișează un mesaj „Formular demonstrativ".
${extraInstructions ? `\nINSTRUCȚIUNI SUPLIMENTARE DE LA DESIGNER\n${extraInstructions}\n` : ''}
Răspunde DOAR cu documentul HTML complet, începând cu <!DOCTYPE html>. Fără explicații, fără blocuri de cod markdown.`

  const client = new Anthropic({ apiKey })
  const encoder = new TextEncoder()

  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      try {
        const stream = client.beta.messages.stream({
          model: 'claude-opus-5-5',
          max_tokens: 48000,
          output_config: { effort: 'medium' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          messages: [{ role: 'user', content: prompt }],
        })

        let chars = 0
        let lastSent = 0
        stream.on('text', delta => {
          chars += delta.length
          if (chars - lastSent > 1500) { lastSent = chars; send({ t: 'progress', chars }) }
        })

        const msg = await stream.finalMessage()
        if (msg.stop_reason === 'refusal') throw new Error('Modelul a refuzat cererea')

        // Dacă a intervenit un model de rezervă, textul valid e cel de după ultimul bloc 'fallback'
        const lastFallback = msg.content.map(b => b.type).lastIndexOf('fallback')
        let html = msg.content.slice(lastFallback + 1)
          .map(b => (b.type === 'text' ? b.text : '')).join('').trim()
        html = html.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim()
        const start = html.search(/<!doctype html|<html/i)
        if (start > 0) html = html.slice(start)
        if (!/<html/i.test(html)) throw new Error('Răspunsul nu conține HTML')
        if (msg.stop_reason === 'max_tokens') throw new Error('Demo-ul a fost tăiat (prea lung) — încearcă din nou')

        send({ t: 'done', html: html.startsWith('<!') ? html : '<!DOCTYPE html>\n' + html })
      } catch (err) {
        send({ t: 'error', error: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

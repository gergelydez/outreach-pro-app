// Generarea unui site concept (demo) pentru o afacere reală: promptul (cu pozele și recenziile
// ei din Google, conținutul site-ului actual) și apelul către Claude. Folosit de Rebuild (RO)
// și de demo-urile din CRM (UK / Ungaria), care rulează complet pe server.
import Anthropic from '@anthropic-ai/sdk'
import { HU_CITIES } from '@/lib/constants'
import type { RebuildLead } from '@/lib/rebuild'
import { placeContext } from '@/lib/place-context'

export type RedesignLanguage = 'en' | 'hu' | undefined

export async function buildRedesignPrompt(lead: RebuildLead, opts: { googleApiKey?: string; origin: string; language?: RedesignLanguage; extraInstructions?: string }): Promise<string> {
  const { googleApiKey, language, extraInstructions = '' } = opts
  if (!lead.audit) throw new Error('Rulează mai întâi auditul site-ului')
  const a = lead.audit
  // UK (CRM): site în engleză britanică; altfel română / maghiară după oraș
  const lang = language === 'en' ? 'engleză (British English, ortografie UK: colour, specialise etc.)' : language === 'hu' || HU_CITIES.includes(lead.city.replace(' 🏘️', '').trim()) ? 'maghiară' : 'română'
  const tel = (a.phones[0] || lead.phone || '').replace(/\s/g, '')
  const hasRating = lead.rating >= 4.0 && lead.reviews_count >= 10

  const noSite = !!lead.no_site
  // Poze și recenzii reale din Google Maps + poze libere ale localității — ca site-ul să fie al LOR
  const ctx = await placeContext({ placeId: lead.place_id, address: lead.address, city: lead.city, googleKey: googleApiKey, origin: opts.origin, language: language === 'en' ? 'en' : language === 'hu' ? 'hu' : 'ro' })
  const photoList = (list: { url: string; credit: string }[]) => list.map(p => `  • ${p.url}\n    credit: ${p.credit}`).join('\n')
  const prompt = `Ești un web designer senior. ${noSite
    ? 'Construiește PRIMUL site al unei afaceri locale reale care încă nu are site propriu'
    : 'Refă site-ul unei afaceri locale reale'} ca un concept modern, single-file HTML, pe care îl vom arăta proprietarului ca preview: „uite cum ar putea arăta site-ul vostru".

AFACEREA
- Nume: ${lead.name}
- Domeniu: ${lead.category_label}
- Oraș / adresă: ${lead.address || lead.city}
- Telefon: ${a.phones[0] || lead.phone || '—'}
- Email: ${a.emails[0] || '—'}
- Site actual: ${noSite ? `nu au site propriu${a.final_url ? ` (doar ${a.final_url})` : ' (doar profilul Google Maps)'}` : a.final_url}
${hasRating ? `- Google: ${lead.rating}★ din ${lead.reviews_count} recenzii (date reale, le poți afișa exact așa)` : ''}
${a.socials.length ? `- Social: ${a.socials.join(', ')}` : ''}

${noSite ? 'DATE REALE DESPRE AFACERE (din Google; nu există site din care să preiei texte)' : 'CONȚINUTUL REAL DE PE SITE-UL ACTUAL (sursa ta de adevăr)'}
Titlu: ${a.title || '—'}
Descriere: ${a.description || '—'}
Titluri de secțiuni: ${a.headings.join(' | ') || '—'}
Text:
"""
${a.text_excerpt || (noSite ? '(fără alte date)' : '(site-ul nu a putut fi citit — folosește doar datele de mai sus)')}
"""
${a.logo_url ? `Logo: ${a.logo_url}` : ''}
${a.images.length ? `Imagini proprii de pe site (folosește-le cu <img src> unde se potrivesc, cu object-fit:cover și fundal de rezervă dacă nu se încarcă): ${a.images.join(' , ')}` : ''}

${ctx.photos.length ? `POZE REALE ALE AFACERII (din Google Maps, încărcate de proprietar și de clienți) — sunt pozele LOR, folosește-le ca imagini principale (hero, galerie, secțiuni)${a.images.length ? ', alături de cele de pe site' : ''}. Pune creditul mic, discret, pe poză sau sub galerie, exact cum e scris:
${photoList(ctx.photos)}
` : ''}
${ctx.localityPhotos.length ? `POZE ALE LOCALITĂȚII ${ctx.locality.toUpperCase()} (Wikimedia Commons, licență liberă) — pentru secțiunea de locație / atmosferă, ca site-ul să fie clar din zona lor. Creditul e obligatoriu, mic, pe poză:
${photoList(ctx.localityPhotos)}
` : ''}
${ctx.reviews.length ? `CE SPUN CLIENȚII LOR (recenzii reale de pe Google, citate exact):
${ctx.reviews.map(r => `  • ${r.author || 'Client'} (${r.rating}★, ${r.when}): „${r.text}"`).join('\n')}
Folosește ce laudă clienții (oameni, atmosferă, detalii concrete) ca idei pentru textele site-ului, fără să adaugi lucruri care nu apar. Poți cita exact 2–3 recenzii scurte, cu prenumele autorului și eticheta „Recenzie Google".
` : ''}
${noSite ? '' : `PROBLEMELE SITE-ULUI ACTUAL (rezolvă-le vizibil în concept)
${a.issues.map(i => `- ${i}`).join('\n') || '- design învechit'}`}

CE CONSTRUIEȘTI
- Structură potrivită domeniului: hero clar cu ce fac și unde, ${noSite ? `servicii tipice pentru ${lead.category_label}, formulate general (fără prețuri, fără detalii pe care nu le știm — proprietarul le va confirma)` : 'serviciile LOR reale (din textul de mai sus)'}, de ce ei, ${hasRating ? 'dovada socială cu ratingul Google real, ' : ''}program/locație dacă apar în text, contact cu telefon clickabil (href="tel:${tel}") și, dacă e cazul, buton de programare / cerere ofertă.
- Design 2026, nu template: tipografie bună (poți folosi Google Fonts), paletă derivată din domeniu și din identitatea lor actuală, spațiere generoasă, mobile-first, animații subtile la scroll, navigație sticky care pe mobil devine meniu.
- Tot conținutul în limba ${lang}${language === 'en' ? '' : ', cu diacritice corecte'}. Ton profesionist, cald, specific afacerii lor.${language === 'en' ? ' Afacerea e în Marea Britanie: telefon în format UK, fără mențiuni despre România.' : language === 'hu' ? ' Afacerea e în Ungaria: telefon în format maghiar (+36), fără mențiuni despre România.' : ''}
- PERSONALIZARE: proprietarul trebuie să simtă că e site-ul LUI. Numele ${lead.name}, localitatea ${ctx.locality}, pozele lor și detaliile din recenzii apar peste tot. Evită orice frază generică valabilă pentru orice ${lead.category_label.toLowerCase()}.
- Un singur fișier: CSS în <style>, JS minimal în <script>. Fără framework-uri.
- Fără imagini stock inventate; unde nu ai poze proprii folosește compoziții CSS (gradiente, forme, iconițe SVG inline).

ONESTITATE — OBLIGATORIU
- NU inventa fapte: prețuri, ani de experiență, număr de clienți, certificări, nume de angajați, premii. Dacă nu apar în text, nu le pune.
- NU inventa recenzii sau testimoniale. ${ctx.reviews.length ? 'Folosește DOAR recenziile reale de mai sus, citate exact.' : `Dacă vrei o secțiune de testimoniale, pune ${hasRating ? 'ratingul Google real și ' : ''}un card discret „Aici apar recenziile voastre reale de pe Google".`}
- Folosește DOAR URL-urile de poze date mai sus (fără alte imagini de pe internet), fiecare cu creditul ei.
- Formularele nu trimit nicăieri: la submit afișează un mesaj ${language === 'en' ? '„This is a demo form”' : language === 'hu' ? '„Ez egy bemutató űrlap”' : '„Formular demonstrativ"'}.
${extraInstructions ? `\nINSTRUCȚIUNI SUPLIMENTARE DE LA DESIGNER\n${extraInstructions}\n` : ''}
Răspunde DOAR cu documentul HTML complet, începând cu <!DOCTYPE html>. Fără explicații, fără blocuri de cod markdown.`
  return prompt
}

export async function generateHtml(client: Anthropic, prompt: string | Anthropic.Beta.BetaContentBlockParam[], onProgress?: (chars: number) => void): Promise<string> {
  const stream = client.beta.messages.stream({
    model: 'claude-opus-5-5',
    max_tokens: 48000,
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }],
  })

  // Vercel oprește funcția după 5 minute: ne oprim noi înainte, ca să salvăm o eroare clară (nu „în lucru” la nesfârșit)
  const limitS = Number(process.env.GENERATE_MAX_SECONDS) || 270
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; stream.abort() }, limitS * 1000)

  if (onProgress) {
    let chars = 0
    let lastSent = 0
    stream.on('text', delta => {
      chars += delta.length
      if (chars - lastSent > 1500) { lastSent = chars; onProgress(chars) }
    })
  }

  let msg: Awaited<ReturnType<typeof stream.finalMessage>>
  try { msg = await stream.finalMessage() } catch (e) {
    if (timedOut) throw new Error(`Claude a avut nevoie de mai mult de ${Math.round(limitS / 60)} minute și generarea a fost oprită. Încearcă din nou (de obicei merge a doua oară) sau cere modificări mai puține deodată.`)
    throw e
  } finally { clearTimeout(timer) }
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
  return html.startsWith('<!') ? html : '<!DOCTYPE html>\n' + html
}

// Demo (site concept) pentru o firmă din CRM, generat complet pe server: utilizatorul apasă
// „Fă demo” și poate închide pagina. La final linkul /p/<slug> e salvat pe firmă.
import { randomBytes } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { q, one, withDbSession } from './db'
import { outsideSession } from './blob-db'
import { logActivity } from './activity'
import { categoriesFor, asCountry } from './countries'
import { buildRedesignPrompt, generateHtml } from '@/lib/redesign'
import { slugify, withConceptBanner, stripConceptBanner } from '@/lib/preview'
import { publishScreenshot } from './screenshot'
import { hasCmsMarkers, cmsPromptAddon, extractInitial, sanitizeContent, publishContent, type CmsContent } from './cms-shared'
import { friendlyAnthropicError } from '@/lib/anthropic-error'
import type { RebuildLead } from '@/lib/rebuild'

export const DEMO_STALE_MIN = 10 // după 10 minute un demo „în lucru” e considerat blocat (se poate reporni)

interface DemoLeadRow {
  id: string; name: string; category: string; city: string; address: string | null; phone: string | null; phone_e164: string | null
  email: string | null; website_url: string | null; website_status: string; google_place_id: string | null; google_rating: string | null
  google_review_count: number | null; preview_url: string | null; country: string; demo_status: string | null; demo_started_at: string | null
}

export interface DemoDeps {
  generate?: (prompt: string) => Promise<string>              // pentru teste
  publish?: (slug: string, html: string) => Promise<void>       // pentru teste
  siteContent?: (url: string) => Promise<Record<string, unknown> | null>
  schedule?: (p: Promise<unknown>) => void                      // waitUntil în producție
  screenshot?: (slug: string, html: string) => Promise<void>
}

export async function startDemo(id: string, opts: { origin: string; anthropicKey?: string; googleKey?: string; designer?: string }, deps: DemoDeps = {}) {
  const b = await one<DemoLeadRow>(`SELECT id, name, category, city, address, phone, phone_e164, email, website_url, website_status, google_place_id,
      google_rating, google_review_count, preview_url, country, demo_status, demo_started_at FROM businesses WHERE id = $1`, [id])
  if (!b) throw new Error('Lead not found')
  const running = b.demo_status === 'running' && b.demo_started_at && Date.now() - new Date(b.demo_started_at).getTime() < DEMO_STALE_MIN * 60_000
  if (running) return { status: 'running' as const, already: true }
  const apiKey = process.env.ANTHROPIC_API_KEY || opts.anthropicKey
  if (!apiKey && !deps.generate) throw new Error('Lipsă cheia Claude: pune ANTHROPIC_API_KEY în Vercel sau cheia în Setări.')
  await q(`UPDATE businesses SET demo_status = 'running', demo_error = NULL, demo_started_at = now(), updated_at = now() WHERE id = $1`, [id])

  // munca grea rulează în fundal, în afara sesiunii acestei cereri
  const job = outsideSession(() => runDemo(b, { ...opts, apiKey: apiKey || '' }, deps))
  ;(deps.schedule || (p => { void p }))(job)
  return { status: 'running' as const, already: false, job }
}

async function runDemo(b: DemoLeadRow, opts: { origin: string; apiKey: string; googleKey?: string; designer?: string }, deps: DemoDeps) {
  const country = asCountry(b.country)
  try {
    const ownSite = !!b.website_url && !['NO_WEBSITE', 'SOCIAL_ONLY', 'DIRECTORY_ONLY'].includes(b.website_status)
    let audit: Record<string, unknown> = {
      url: b.website_url || '', final_url: b.website_url || '', phones: b.phone ? [b.phone] : [], emails: b.email ? [b.email] : [],
      title: '', description: '', headings: [], text_excerpt: '', logo_url: '', images: [], socials: b.website_url && !ownSite ? [b.website_url] : [], issues: [],
    }
    if (ownSite && b.website_url) {
      const content = deps.siteContent ? await deps.siteContent(b.website_url) : await fetchSiteContent(opts.origin, b.website_url)
      if (content) audit = content
    }
    const lead = {
      place_id: b.google_place_id || '', name: b.name, address: b.address || b.city, city: b.city, category: b.category,
      category_label: categoriesFor(country).find(c => c.key === b.category)?.query || b.category,
      phone: b.phone || '', phone_intl: b.phone_e164 || '', website: ownSite ? b.website_url : '', no_site: !ownSite,
      rating: Number(b.google_rating || 0), reviews_count: b.google_review_count || 0, audit,
    } as unknown as RebuildLead
    const prompt = await buildRedesignPrompt(lead, { googleApiKey: opts.googleKey, origin: opts.origin, language: country === 'HU' ? 'hu' : country === 'UK' ? 'en' : undefined })
    const html = deps.generate ? await deps.generate(prompt) : await generateHtml(new Anthropic({ apiKey: opts.apiKey }), prompt)

    // același link la regenerare (poate l-ai trimis deja)
    const prevSlug = b.preview_url?.match(/\/p\/([a-z0-9-]+)$/)?.[1]
    const slug = prevSlug || `${slugify(b.name)}-${randomBytes(3).toString('hex')}`
    const finalHtml = withConceptBanner(html, b.name, opts.designer || '', country === 'HU' ? 'hu' : country === 'UK' ? 'en' : 'ro')
    if (deps.publish) await deps.publish(slug, finalHtml)
    else {
      const { put } = await import('@vercel/blob')
      await put(`previews/${slug}.html`, finalHtml, { access: 'public', contentType: 'text/html; charset=utf-8', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 })
    }
    await takeShot(slug, finalHtml, deps.screenshot)
    const url = `${opts.origin}/p/${slug}`
    await withDbSession(async () => {
      await q(`UPDATE businesses SET preview_url = $2, demo_at = now(), demo_status = 'done', demo_error = NULL, updated_at = now() WHERE id = $1`, [b.id, url])
      await logActivity(b.id, 'demo_published', `Demo website published: ${url}`)
    })
    return url
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? friendlyAnthropicError(e, process.env.ANTHROPIC_API_KEY ? 'env' : 'settings') : e instanceof Error ? e.message : String(e)
    await withDbSession(() => q(`UPDATE businesses SET demo_status = 'error', demo_error = $2, updated_at = now() WHERE id = $1`, [b.id, msg.slice(0, 500)])).catch(() => {})
    return null
  }
}

async function fetchSiteContent(origin: string, url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${origin}/api/audit-site`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(45_000) })
    const d = await res.json()
    return res.ok && d.audit ? d.audit : null
  } catch { return null }
}

// ── Modificări cerute de client: Claude editează site-ul existent, păstrând același link ──
export interface EditDeps {
  load?: (slug: string) => Promise<string>
  generate?: (prompt: string) => Promise<string>
  publish?: (slug: string, html: string) => Promise<void>
  schedule?: (p: Promise<unknown>) => void
  screenshot?: (slug: string, html: string) => Promise<void>
  put?: (path: string, body: string) => Promise<void>
}

export const slugOf = (previewUrl: string | null) => previewUrl?.match(/\/p\/([a-z0-9-]+)$/)?.[1] || null

export async function loadSiteHtml(slug: string): Promise<string> {
  const { head } = await import('@vercel/blob')
  const meta = await head(`previews/${slug}.html`)
  const res = await fetch(meta.url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Nu am găsit site-ul (${res.status})`)
  return res.text()
}

export function buildEditPrompt(html: string, instructions: string, lang: string) {
  return `Mai jos e codul HTML complet al site-ului unei firme mici. Clientul a cerut aceste modificări:

<modificari>
${instructions}
</modificari>

Aplică exact modificările cerute și păstrează tot restul site-ului neschimbat (design, structură, texte, imagini, linkuri). Textele noi le scrii în limba site-ului (${lang}). Dacă o modificare cere ceva ce nu ai (de exemplu o poză nouă), pune un loc clar marcat pentru ea în loc să inventezi.
Răspunde DOAR cu codul HTML complet, actualizat, începând cu <!DOCTYPE html>.

<site>
${html}
</site>`
}

export async function startEdit(id: string, opts: { instructions: string; anthropicKey?: string; designer?: string }, deps: EditDeps = {}) {
  const b = await one<DemoLeadRow>(`SELECT id, name, category, city, address, phone, phone_e164, email, website_url, website_status, google_place_id,
      google_rating, google_review_count, preview_url, country, demo_status, demo_started_at FROM businesses WHERE id = $1`, [id])
  if (!b) throw new Error('Lead not found')
  const slug = slugOf(b.preview_url)
  if (!slug) throw new Error('Firma nu are încă un demo — fă mai întâi demo-ul.')
  const running = b.demo_status === 'running' && b.demo_started_at && Date.now() - new Date(b.demo_started_at).getTime() < DEMO_STALE_MIN * 60_000
  if (running) return { status: 'running' as const, already: true }
  const apiKey = process.env.ANTHROPIC_API_KEY || opts.anthropicKey
  if (!apiKey && !deps.generate) throw new Error('Lipsă cheia Claude: pune ANTHROPIC_API_KEY în Vercel sau cheia în Setări.')
  await q(`UPDATE businesses SET demo_status = 'running', demo_error = NULL, demo_started_at = now(), updated_at = now() WHERE id = $1`, [id])
  const job = outsideSession(() => runEdit(b, slug, { ...opts, apiKey: apiKey || '' }, deps))
  ;(deps.schedule || (p => { void p }))(job)
  return { status: 'running' as const, already: false, job }
}

async function runEdit(b: DemoLeadRow, slug: string, opts: { instructions: string; apiKey: string; designer?: string }, deps: EditDeps) {
  const country = asCountry(b.country)
  const lang = country === 'HU' ? 'hu' : country === 'UK' ? 'en' : 'ro'
  try {
    const current = stripConceptBanner(deps.load ? await deps.load(slug) : await loadSiteHtml(slug))
    const cms = hasCmsMarkers(current) ? await portalContent(b.id) : null
    const prompt = buildEditPrompt(current, opts.instructions, lang === 'hu' ? 'maghiară' : lang === 'en' ? 'engleză' : 'română') + (cms ? cmsPromptAddon(cms) : '')
    const raw = deps.generate ? await deps.generate(prompt) : await generateHtml(new Anthropic({ apiKey: opts.apiKey }), prompt)
    const html = cms ? await savePortalFromHtml(b.id, slug, raw, deps.put) : raw
    const finalHtml = withConceptBanner(html, b.name, opts.designer || '', lang)
    if (deps.publish) await deps.publish(slug, finalHtml)
    else {
      const { put } = await import('@vercel/blob')
      await put(`previews/${slug}.html`, finalHtml, { access: 'public', contentType: 'text/html; charset=utf-8', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 })
    }
    await takeShot(slug, finalHtml, deps.screenshot)
    await withDbSession(async () => {
      await q(`UPDATE businesses SET demo_at = now(), demo_status = 'done', demo_error = NULL, updated_at = now() WHERE id = $1`, [b.id])
      await logActivity(b.id, 'demo_published', `Site edited: ${opts.instructions.slice(0, 300)}`)
    })
    return true
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? friendlyAnthropicError(e, process.env.ANTHROPIC_API_KEY ? 'env' : 'settings') : e instanceof Error ? e.message : String(e)
    await withDbSession(() => q(`UPDATE businesses SET demo_status = 'error', demo_error = $2, updated_at = now() WHERE id = $1`, [b.id, msg.slice(0, 500)])).catch(() => {})
    return false
  }
}

// Poza pentru WhatsApp: dacă nu reușește, demo-ul rămâne valabil (poza se poate face și la cerere)
export async function takeShot(slug: string, html: string, custom?: (slug: string, html: string) => Promise<void>) {
  try { await (custom || ((s: string, h: string) => publishScreenshot(s, h)))(slug, html) } catch (e) { console.warn('screenshot failed', e) }
}

// ── Pozele trimise de client: Claude le alege pe cele mai bune și le pune în site (același link) ──
export const PHOTO_PREFIX = (id: string) => `client-photos/${id}/`
export const MAX_PHOTOS = 100

export async function listClientPhotos(id: string): Promise<string[]> {
  const { list } = await import('@vercel/blob')
  const out: string[] = []
  let cursor: string | undefined
  do {
    const r = await list({ prefix: PHOTO_PREFIX(id), cursor, limit: 1000 })
    out.push(...r.blobs.map(b => b.url))
    cursor = r.hasMore ? r.cursor : undefined
  } while (cursor)
  return out
}

export function buildPhotosPrompt(html: string, photoUrls: string[], name: string, lang: string, note?: string): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: 'text', text: `Clientul firmei „${name}” ne-a trimis ${photoUrls.length} poze. Înaintea fiecărei poze e eticheta cu URL-ul ei.` },
  ]
  photoUrls.forEach((url, i) => {
    blocks.push({ type: 'text', text: `Poza ${i + 1}: ${url}` })
    blocks.push({ type: 'image', source: { type: 'url', url } })
  })
  blocks.push({ type: 'text', text: `Alege cele mai bune poze pentru site, de obicei 6–12: clare, luminoase, reprezentative pentru afacere, fără dubluri, fără poze mișcate sau întunecate, fără documente, capturi de ecran sau date personale.
Înlocuiește pozele din site (inclusiv cele luate de pe Google și orice imagine generică) cu pozele alese, folosind EXACT URL-urile lor în src. Pune cea mai bună poză în prima secțiune; pe celelalte, în galerie și în secțiunile potrivite (servicii, despre noi). Adaugă texte alt descriptive în ${lang}.${note ? `\nIndicațiile clientului: ${note}` : ''}
Păstrează restul site-ului neschimbat (design, texte, structură, linkuri). Răspunde DOAR cu codul HTML complet, actualizat, începând cu <!DOCTYPE html>.

<site>
${html}
</site>` })
  return blocks
}

export interface PhotoDeps extends Omit<EditDeps, 'generate'> {
  photos?: (id: string) => Promise<string[]>
  generate?: (content: Anthropic.Beta.BetaContentBlockParam[]) => Promise<string>
}

export async function startPhotos(id: string, opts: { note?: string; anthropicKey?: string; designer?: string }, deps: PhotoDeps = {}) {
  const b = await one<DemoLeadRow>(`SELECT id, name, category, city, address, phone, phone_e164, email, website_url, website_status, google_place_id,
      google_rating, google_review_count, preview_url, country, demo_status, demo_started_at FROM businesses WHERE id = $1`, [id])
  if (!b) throw new Error('Lead not found')
  const slug = slugOf(b.preview_url)
  if (!slug) throw new Error('Firma nu are încă un demo — fă mai întâi demo-ul.')
  const photos = (await (deps.photos || listClientPhotos)(id)).slice(0, MAX_PHOTOS)
  if (!photos.length) throw new Error('Încarcă întâi pozele clientului.')
  const running = b.demo_status === 'running' && b.demo_started_at && Date.now() - new Date(b.demo_started_at).getTime() < DEMO_STALE_MIN * 60_000
  if (running) return { status: 'running' as const, already: true }
  const apiKey = process.env.ANTHROPIC_API_KEY || opts.anthropicKey
  if (!apiKey && !deps.generate) throw new Error('Lipsă cheia Claude: pune ANTHROPIC_API_KEY în Vercel sau cheia în Setări.')
  await q(`UPDATE businesses SET demo_status = 'running', demo_error = NULL, demo_started_at = now(), updated_at = now() WHERE id = $1`, [id])
  const job = outsideSession(async () => {
    const country = asCountry(b.country)
    const lang = country === 'HU' ? 'hu' : country === 'UK' ? 'en' : 'ro'
    try {
      const current = stripConceptBanner(deps.load ? await deps.load(slug) : await loadSiteHtml(slug))
      const cms = hasCmsMarkers(current) ? await portalContent(b.id) : null
      const content = buildPhotosPrompt(current, photos, b.name, lang === 'hu' ? 'maghiară' : lang === 'en' ? 'engleză' : 'română', opts.note)
      if (cms) content.push({ type: 'text', text: cmsPromptAddon(cms) })
      const raw = deps.generate ? await deps.generate(content) : await generateHtml(new Anthropic({ apiKey: apiKey || '' }), content)
      const html = cms ? await savePortalFromHtml(b.id, slug, raw, deps.put) : raw
      const finalHtml = withConceptBanner(html, b.name, opts.designer || '', lang)
      if (deps.publish) await deps.publish(slug, finalHtml)
      else {
        const { put } = await import('@vercel/blob')
        await put(`previews/${slug}.html`, finalHtml, { access: 'public', contentType: 'text/html; charset=utf-8', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 })
      }
      await takeShot(slug, finalHtml, deps.screenshot)
      await withDbSession(async () => {
        await q(`UPDATE businesses SET demo_at = now(), demo_status = 'done', demo_error = NULL, updated_at = now() WHERE id = $1`, [b.id])
        await logActivity(b.id, 'demo_published', `Client photos added to the site (${photos.length} uploaded)`)
      })
      return true
    } catch (e) {
      const msg = e instanceof Anthropic.APIError ? friendlyAnthropicError(e, process.env.ANTHROPIC_API_KEY ? 'env' : 'settings') : e instanceof Error ? e.message : String(e)
      await withDbSession(() => q(`UPDATE businesses SET demo_status = 'error', demo_error = $2, updated_at = now() WHERE id = $1`, [b.id, msg.slice(0, 500)])).catch(() => {})
      return false
    }
  })
  ;(deps.schedule || (p => { void p }))(job)
  return { status: 'running' as const, already: false, job, count: photos.length }
}

// Site cu panou de client: datele lui merg în prompt, iar ce întoarce Claude devine noul conținut al panoului
async function portalContent(id: string): Promise<CmsContent | null> {
  const p = await withDbSession(() => one<{ content: CmsContent }>('SELECT content FROM client_portals WHERE business_id = $1', [id])).catch(() => null)
  return p ? sanitizeContent(p.content) : null
}
async function savePortalFromHtml(id: string, slug: string, raw: string, put?: (path: string, body: string) => Promise<void>): Promise<string> {
  const { html, content } = extractInitial(raw)
  if (content) {
    const c = { ...content, updated_at: new Date().toISOString() }
    await withDbSession(() => q('UPDATE client_portals SET content = $2, updated_at = now() WHERE business_id = $1', [id, JSON.stringify(c)]))
    await publishContent(slug, c, put)
  }
  return html
}

// Panoul clientului: își schimbă singur tarifele, ofertele, galeria și datele de contact.
// Site-ul (demo-ul sau cel publicat pe Cloudflare) are marcaje data-cms-*, iar /cms.js le completează
// cu datele publicate la /api/site/<slug>. Fără JavaScript, site-ul rămâne cu ultimele date din HTML.
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { q, one, withDbSession } from './db'
import { outsideSession } from './blob-db'
import { logActivity } from './activity'
import { asCountry } from './countries'
import { loadSiteHtml, slugOf, takeShot, DEMO_STALE_MIN } from './demo'
import { generateHtml } from '@/lib/redesign'
import { withConceptBanner, stripConceptBanner } from '@/lib/preview'
import { friendlyAnthropicError } from '@/lib/anthropic-error'
import { sanitizeContent, publishContent, hasCmsContent, extractInitial, EMPTY_CONTENT, FORM_RULES, type CmsContent } from './cms-shared'
import { putFile } from '@/lib/object-store'
export * from './cms-shared'

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`
}
function pinOk(pin: string, stored: string) {
  const [salt, hex] = stored.split(':')
  if (!salt || !hex) return false
  const a = scryptSync(pin, salt, 32)
  const b = Buffer.from(hex, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
const newPin = () => String(100000 + (randomBytes(4).readUInt32BE(0) % 900000))

// Creează panoul (sau dă un PIN nou, cu același link)
export async function createPortal(businessId: string) {
  const pin = newPin()
  const existing = await one<{ token: string }>('SELECT token FROM client_portals WHERE business_id = $1', [businessId])
  const token = existing?.token || randomBytes(18).toString('base64url')
  if (existing) await q('UPDATE client_portals SET pin_hash = $2, failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE business_id = $1', [businessId, hashPin(pin)])
  else await q('INSERT INTO client_portals (business_id, token, pin_hash) VALUES ($1, $2, $3)', [businessId, token, hashPin(pin)])
  return { token, pin, created: !existing }
}

export interface PortalBusiness { business_id: string; name: string; country: string; preview_url: string | null; content: CmsContent }

// 5 coduri greșite → blocat 15 minute
export async function verifyPortal(token: string, pin: string): Promise<PortalBusiness> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) throw new PortalError('Link invalid', 404)
  const p = await one<{ business_id: string; pin_hash: string; failed_attempts: number; locked_until: string | null; content: CmsContent; name: string; country: string; preview_url: string | null }>(
    `SELECT p.business_id, p.pin_hash, p.failed_attempts, p.locked_until, p.content, b.name, b.country, b.preview_url
       FROM client_portals p JOIN businesses b ON b.id = p.business_id WHERE p.token = $1`, [token])
  if (!p) throw new PortalError('Link invalid', 404)
  if (p.locked_until && new Date(p.locked_until).getTime() > Date.now()) throw new PortalError('locked', 429)
  if (!/^\d{6}$/.test(pin) || !pinOk(pin, p.pin_hash)) {
    const fails = p.failed_attempts + 1
    if (fails >= 5) await q(`UPDATE client_portals SET failed_attempts = 0, locked_until = now() + interval '15 minutes' WHERE business_id = $1`, [p.business_id])
    else await q('UPDATE client_portals SET failed_attempts = $2 WHERE business_id = $1', [p.business_id, fails])
    throw new PortalError(fails >= 5 ? 'locked' : 'pin', fails >= 5 ? 429 : 401)
  }
  if (p.failed_attempts) await q('UPDATE client_portals SET failed_attempts = 0 WHERE business_id = $1', [p.business_id])
  return { business_id: p.business_id, name: p.name, country: p.country, preview_url: p.preview_url, content: sanitizeContent(p.content) }
}

export class PortalError extends Error { constructor(message: string, public status: number) { super(message) } }

export async function saveContent(businessId: string, input: unknown, deps: { put?: (path: string, body: string) => Promise<void> } = {}) {
  const content = { ...sanitizeContent(input), updated_at: new Date().toISOString() }
  await q('UPDATE client_portals SET content = $2, updated_at = now() WHERE business_id = $1', [businessId, JSON.stringify(content)])
  const b = await one<{ preview_url: string | null }>('SELECT preview_url FROM businesses WHERE id = $1', [businessId])
  const slug = slugOf(b?.preview_url ?? null)
  if (slug) await publishContent(slug, content, deps.put)
  await logActivity(businessId, 'client_portal_saved', 'The client updated prices / offers / photos / contact')
  return content
}

export function buildMarkupPrompt(html: string, lang: string) {
  return `Mai jos e codul HTML complet al site-ului unei firme mici. Clientul vrea să-și schimbe singur, dintr-un panou, tarifele, ofertele, pozele din galerie și datele de contact. Fă site-ul editabil adăugând EXACT marcajele de mai jos. Designul și conținutul vizibil rămân neschimbate.

1. TARIFE: secțiunea de tarife primește atributul data-cms-section="prices". În ea, un container cu data-cms="prices", ai cărui COPII DIRECȚI sunt tarifele; fiecare tarif are data-cms-item și conține un element cu data-cms-field="name", unul cu data-cms-field="price" și unul cu data-cms-field="note" (nota poate fi goală). Dacă site-ul nu are tarife, adaugă o secțiune Tarife potrivită designului, cu UN SINGUR element-model, iar secțiunea primește style="display:none" (apare când clientul adaugă tarife). Nu inventa prețuri.
2. OFERTE: la fel, cu data-cms-section="offers", data-cms="offers", câmpurile title, text și period. Dacă nu există oferte, secțiunea are un singur element-model și style="display:none".
3. GALERIE: secțiunea cu poze primește data-cms-section="gallery"; containerul data-cms="gallery", iar fiecare poză este un copil direct cu data-cms-item care conține un <img data-cms-field="src">. Păstrează pozele existente.
4. CONTACT: orice afișare a telefonului primește data-cms-text="phone", iar orice link tel: primește data-cms-tel; emailul afișat data-cms-text="email", linkurile mailto: data-cms-mailto; adresa data-cms-text="address"; programul data-cms-text="hours".
5. ${FORM_RULES}
6. CAMERE / SPAȚII (doar dacă site-ul prezintă camere, apartamente, căsuțe sau spații de închiriat, ex. piscină, salon de evenimente, terasă): secțiunea primește data-cms-section="rooms"; în ea un container data-cms="rooms" ai cărui COPII DIRECȚI sunt cardurile; fiecare card are data-cms-item și conține data-cms-field="title" (ex. „Cameră dublă cu baie”), data-cms-field="text" (descrierea, dotările), data-cms-field="price" (poate fi gol) și un container de poze cu atributul data-cms-photos care are UN SINGUR copil-model ce conține un <img>. Containerul de poze e un carusel orizontal: display:flex; overflow-x:auto; scroll-snap-type:x mandatory; copiii au flex:0 0 100% și scroll-snap-align:start, aceeași înălțime și același colț rotunjit ca poza de acum. Păstrează cardurile și pozele existente. Dacă site-ul nu are așa ceva, nu adăuga secțiunea.
7. Păstrează toate marcajele data-cms-* care există deja.
8. Chiar înainte de </body>, adaugă:
<script type="application/json" id="cms-initial">{"contact":{"phone":"","email":"","address":"","hours":""},"prices":[{"name":"","price":"","note":""}],"offers":[{"title":"","text":"","from":"","to":"","active":true}],"gallery":[{"src":"","alt":""}],"rooms":[{"title":"","text":"","price":"","photos":[""]}]}</script>
completat cu valorile EXACTE de acum de pe site (listele goale [] dacă nu există; datele from/to în format AAAA-LL-ZZ sau ""). Nu inventa nimic.
Nu adăuga alte scripturi pentru asta. Textele noi, dacă e nevoie, în ${lang}. Răspunde DOAR cu codul HTML complet, începând cu <!DOCTYPE html>.

<site>
${html}
</site>`
}

// Datele clientului au prioritate; o listă nouă de pe site (ex. camerele, la prima pregătire) completează ce lipsește
export function mergeContent(current: CmsContent, fromSite: CmsContent | null): CmsContent {
  if (!fromSite) return current
  const c = { ...current }
  for (const k of ['prices', 'offers', 'gallery', 'rooms'] as const) if (!c[k]?.length && fromSite[k]?.length) (c as Record<string, unknown>)[k] = fromSite[k]
  c.contact = { ...fromSite.contact, ...Object.fromEntries(Object.entries(current.contact).filter(([, v]) => v)) } as CmsContent['contact']
  return c
}

interface MarkupDeps {
  load?: (slug: string) => Promise<string>
  generate?: (prompt: string) => Promise<string>
  publish?: (slug: string, html: string) => Promise<void>
  put?: (path: string, body: string) => Promise<void>
  screenshot?: (slug: string, html: string) => Promise<void>
  schedule?: (p: Promise<unknown>) => void
}

// Claude adaugă marcajele pe site (o singură dată), apoi datele de acum devin conținutul inițial al panoului
export async function startMarkup(id: string, opts: { anthropicKey?: string; designer?: string }, deps: MarkupDeps = {}) {
  const b = await one<{ id: string; name: string; country: string; preview_url: string | null; demo_status: string | null; demo_started_at: string | null }>(
    'SELECT id, name, country, preview_url, demo_status, demo_started_at FROM businesses WHERE id = $1', [id])
  if (!b) throw new Error('Lead not found')
  const slug = slugOf(b.preview_url)
  if (!slug) throw new Error('Firma nu are încă un demo — fă mai întâi demo-ul.')
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
      const prompt = buildMarkupPrompt(current, lang === 'hu' ? 'maghiară' : lang === 'en' ? 'engleză' : 'română')
      const raw = deps.generate ? await deps.generate(prompt) : await generateHtml(new Anthropic({ apiKey: apiKey || '' }), prompt)
      const { html, content } = extractInitial(raw)
      if (!hasCmsContent(html)) throw new Error('Site-ul n-a putut fi făcut editabil — încearcă din nou.')
      const finalHtml = withConceptBanner(html, b.name, opts.designer || '', lang)
      if (deps.publish) await deps.publish(slug, finalHtml)
      else {
        await putFile(`previews/${slug}.html`, finalHtml, { contentType: 'text/html; charset=utf-8' })
      }
      await takeShot(slug, finalHtml, deps.screenshot)
      await withDbSession(async () => {
        const p = await one<{ content: CmsContent }>('SELECT content FROM client_portals WHERE business_id = $1', [b.id])
        const empty = !p || !p.content || !Object.keys(p.content).length
        const initial = { ...(empty ? content || EMPTY_CONTENT : mergeContent(sanitizeContent(p!.content), content)), updated_at: new Date().toISOString() }
        if (p) await q('UPDATE client_portals SET content = $2, updated_at = now() WHERE business_id = $1', [b.id, JSON.stringify(initial)])
        await publishContent(slug, initial, deps.put)
        await q(`UPDATE businesses SET demo_at = now(), demo_status = 'done', demo_error = NULL, updated_at = now() WHERE id = $1`, [b.id])
        await logActivity(b.id, 'demo_published', 'Site made editable for the client panel')
      })
      return true
    } catch (e) {
      const msg = e instanceof Anthropic.APIError ? friendlyAnthropicError(e, process.env.ANTHROPIC_API_KEY ? 'env' : 'settings') : e instanceof Error ? e.message : String(e)
      await withDbSession(() => q(`UPDATE businesses SET demo_status = 'error', demo_error = $2, updated_at = now() WHERE id = $1`, [b.id, msg.slice(0, 500)])).catch(() => {})
      return false
    }
  })
  ;(deps.schedule || (p => { void p }))(job)
  return { status: 'running' as const, already: false, job }
}

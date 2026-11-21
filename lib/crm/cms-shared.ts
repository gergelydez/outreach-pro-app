// Părțile comune ale panoului clientului (folosite și de demo.ts, fără import circular)
export interface CmsContent {
  contact: { phone: string; email: string; address: string; hours: string }
  prices: { name: string; price: string; note: string }[]
  offers: { title: string; text: string; from: string; to: string; active: boolean }[]
  gallery: { src: string; alt: string }[]
  updated_at?: string
}

export const EMPTY_CONTENT: CmsContent = { contact: { phone: '', email: '', address: '', hours: '' }, prices: [], offers: [], gallery: [] }

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') as Record<string, unknown>[] : [])

// Curăță tot ce vine din browser sau de la Claude: lungimi limitate, doar poze https
export function sanitizeContent(v: unknown): CmsContent {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const c = (o.contact && typeof o.contact === 'object' ? o.contact : {}) as Record<string, unknown>
  return {
    contact: { phone: s(c.phone, 40), email: s(c.email, 120), address: s(c.address, 200), hours: s(c.hours, 400) },
    prices: arr(o.prices).slice(0, 80).map(p => ({ name: s(p.name, 120), price: s(p.price, 60), note: s(p.note, 200) })).filter(p => p.name || p.price),
    offers: arr(o.offers).slice(0, 30).map(p => ({ title: s(p.title, 120), text: s(p.text, 600), from: date(p.from), to: date(p.to), active: p.active !== false })).filter(p => p.title || p.text),
    gallery: arr(o.gallery).slice(0, 60).map(p => ({ src: s(p.src, 500), alt: s(p.alt, 160) })).filter(p => /^https:\/\/[^\s"'<>]+$/.test(p.src)),
  }
}

export async function publishContent(slug: string, content: CmsContent, put?: (path: string, body: string) => Promise<void>) {
  const body = JSON.stringify(content)
  if (put) return put(`site-data/${slug}.json`, body)
  const blob = await import('@vercel/blob')
  await blob.put(`site-data/${slug}.json`, body, { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 })
}

// Scriptul care aduce datele la zi pe site: doar dacă HTML-ul are marcaje
export const hasCmsMarkers = (html: string) => /data-cms(?:-text|-tel|-mailto|-form)?[=\s>]/.test(html)
export const hasCmsForm = (html: string) => /data-cms-form/.test(html)
export function injectCmsScript(html: string, origin: string, slug: string) {
  if (!hasCmsMarkers(html) || html.includes('/cms.js')) return html
  const tag = `<script src="${origin}/cms.js" data-src="${origin}/api/site/${slug}" defer></script>`
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tag}\n</body>`) : html + tag
}

export function extractInitial(html: string): { html: string; content: CmsContent | null } {
  const m = html.match(/<script[^>]*id=["']cms-initial["'][^>]*>([\s\S]*?)<\/script>\s*/i)
  if (!m) return { html, content: null }
  let content: CmsContent | null = null
  try { content = sanitizeContent(JSON.parse(m[1])) } catch { content = null }
  return { html: html.replace(m[0], ''), content }
}


// Când site-ul are deja panou: Claude primește datele actuale ale clientului și le întoarce actualizate
export function cmsPromptAddon(content: CmsContent) {
  return `\n\nATENȚIE: site-ul are marcaje data-cms-* pentru panoul clientului. Păstrează-le pe toate (inclusiv câte un element-model în fiecare listă). Datele actuale din panoul clientului, care au prioritate față de ce scrie în HTML:\n${JSON.stringify(content)}\nAplică modificările și asupra acestor date, iar chiar înainte de </body> pune <script type="application/json" id="cms-initial">…</script> cu datele actualizate, în același format JSON.`
}

// Formularul de contact / rezervare: trimis prin /cms.js la /api/site/<slug>/contact (email + panoul clientului)
export const FORM_RULES = `FORMULAR DE CONTACT: formularul de contact sau de rezervare (dacă nu există, adaugă unul simplu, potrivit designului, în secțiunea de contact) are atributul data-cms-form, fără action și fără mailto. Câmpurile au exact aceste atribute name: "name" (nume), "phone" (telefon), "email", "message" (mesaj); pentru cazare poți adăuga "checkin", "checkout" (type="date") și "guests". Butonul e type="submit". Adaugă în formular un element ascuns <p data-cms-form-success hidden>…</p> cu un mesaj de mulțumire scurt, în limba site-ului.`

// Reguli de așezare pe telefon pentru demo-urile din CRM (după probleme văzute pe site-uri reale)
export const DEMO_LAYOUT_RULES = `REGULI PENTRU TELEFON (obligatorii):
- Secțiunea „Locație / Cum ajungi” (adresă, indicații, buton „Deschide în Google Maps”) rămâne, dar fără să se suprapună cu nimic.
- NU pune buton plutitor „Cere disponibilitatea” (sau alt buton fix în mijlocul ecranului). Pe telefon e permisă cel mult O bară fixă jos, cu două butoane: „Sună” și „WhatsApp” (sau „Rezervă” care duce la formular).
- Antetul (bara de navigație) fix are fundal opac și z-index mai mare decât tot conținutul, deci niciun titlu sau text al paginii nu apare peste el sau prin el la scroll. Pune scroll-margin-top pe secțiuni și padding-top pe pagină egal cu înălțimea antetului, ca titlurile să nu ajungă sub el. Pe ecrane mici (sub 900px) linkurile de meniu stau doar în meniul ☰.
- POZE: folosește DOAR URL-urile de imagini primite mai sus (pozele afacerii, de pe site-ul ei sau ale localității). Nu inventa și nu folosi alte linkuri de imagini (Unsplash, stock, placeholder). Dacă sunt puține poze, completează designul cu fundaluri în gradient, forme și iconițe SVG, nu cu imagini externe.
- Niciun element nu se suprapune peste altul la lățimi de 360–430px: titluri, butoane, carduri și texte rămân lizibile. Lasă jos un spațiu liber cât bara fixă, ca ultimul conținut să nu fie acoperit.`

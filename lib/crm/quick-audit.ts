// Auditul site-ului rulat direct în aplicație (fără workerul Python): descarcă pagina principală
// în siguranță și extrage aceleași fapte (AuditFacts) pe care le clasifică și punctează CRM-ul.
// Workerul Python rămâne opțional, pentru PageSpeed și testul pe telefon cu browser real.
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import type { AuditFacts } from './audit-types'

const UA = 'Mozilla/5.0 (compatible; LocalWebsiteAudit/1.0; one-off public homepage check)'
const MAX_BYTES = 3_000_000
const TIMEOUT_MS = 10_000

// ── Siguranță (SSRF): doar adrese publice, verificate la fiecare redirect ────────────────
export function isPublicIp(ip: string): boolean {
  if (ip.startsWith('::ffff:')) return isPublicIp(ip.slice(7))
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 192 && b === 0) return false
    if (a === 198 && (b === 18 || b === 19)) return false
    return true
  }
  if (isIP(ip) === 6) {
    const l = ip.toLowerCase()
    if (l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb') || l.startsWith('ff')) return false
    return true
  }
  return false
}

export class UnsafeUrl extends Error {}

async function assertPublic(url: URL, allowPrivate: boolean) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new UnsafeUrl('scheme')
  if (url.username || url.password) throw new UnsafeUrl('credentials')
  if (allowPrivate) return
  if (url.port && !['80', '443'].includes(url.port)) throw new UnsafeUrl('port')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new UnsafeUrl('internal host')
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (!addrs.length || addrs.some(a => !isPublicIp(a.address))) throw new UnsafeUrl('non-public address')
}

export interface FetchOut { ok: boolean; status: number | null; finalUrl: string; html: string; contentType: string; errorKind: AuditFacts['error_kind']; ms: number }

export async function safeFetch(url: string, opts: { allowPrivate?: boolean; fetchImpl?: typeof fetch } = {}): Promise<FetchOut> {
  const t0 = Date.now()
  let current = url
  const done = (o: Partial<FetchOut>): FetchOut => ({ ok: false, status: null, finalUrl: current, html: '', contentType: '', errorKind: null, ms: Date.now() - t0, ...o })
  try {
    for (let hop = 0; hop < 6; hop++) {
      await assertPublic(new URL(current), !!opts.allowPrivate)
      const res = await (opts.fetchImpl || fetch)(current, {
        redirect: 'manual', cache: 'no-store',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'en-GB,en;q=0.8' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const loc = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && loc) { current = new URL(loc, current).toString(); continue }
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.length > MAX_BYTES) return done({ status: res.status, errorKind: 'too_large' })
      const html = new TextDecoder('utf-8').decode(buf)
      return done({ ok: res.status < 400, status: res.status, html, contentType: res.headers.get('content-type') || '', errorKind: res.status >= 400 ? 'http_error' : null })
    }
    return done({ errorKind: 'connection' })
  } catch (e) {
    if (e instanceof UnsafeUrl) return done({ errorKind: 'unsafe_target' })
    const msg = `${(e as Error)?.message || ''} ${String((e as { cause?: unknown })?.cause || '')}`.toLowerCase()
    if (/enotfound|eai_again|getaddrinfo|dns/.test(msg)) return done({ errorKind: 'dns' })
    if (/timeout|aborted/.test(msg)) return done({ errorKind: 'timeout' })
    if (/cert|ssl|tls/.test(msg)) return done({ errorKind: 'ssl' })
    return done({ errorKind: 'connection' })
  }
}

// ── Extragerea faptelor din HTML ─────────────────────────────────────────────────────
const decode = (s: string) => s.replace(/&copy;/gi, '©').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
const stripTags = (h: string) => decode(h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const uniq = <T,>(a: T[]) => Array.from(new Set(a))
const CTA_RE = /\b(get (?:a |your )?(?:free )?quote|free quote|request (?:a )?quote|call (?:us|now|today)|book (?:now|online|a)|contact us|get in touch|free estimate|request (?:a )?callback|enquire|enquiry|message us|whatsapp us)\b/i
const SERVICE_WORDS = ['service', 'plumb', 'electric', 'boiler', 'heating', 'repair', 'install', 'roof', 'build', 'extension', 'kitchen', 'bathroom', 'clean', 'garden', 'landscap', 'lock', 'paint', 'decorat', 'plaster', 'carpent', 'rewir', 'emergency']
const LOCAL_TYPES = ['LocalBusiness', 'HomeAndConstructionBusiness', 'Plumber', 'Electrician', 'HVACBusiness', 'RoofingContractor', 'GeneralContractor', 'HousePainter', 'Locksmith', 'ProfessionalService']

function cleanUkPhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '')
  if (d.startsWith('+44')) d = '0' + d.slice(3).replace(/^0/, '')
  return d.startsWith('0') && d.length >= 10 && d.length <= 11 ? d : null
}

export function extractFacts(html: string, baseUrl: string, city?: string | null, year = new Date().getFullYear()): Partial<AuditFacts> {
  const low = html.toLowerCase()
  const text = stripTags(html)
  const vp = html.match(/<meta[^>]+name=["']?viewport["']?[^>]*>/i)?.[0] || ''
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim()
  const desc = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] || '').trim()
  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1] || null

  const links = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)).map(m => ({ href: decode(m[1]).trim(), text: stripTags(m[2]) }))
  const tel = links.filter(l => /^tel:/i.test(l.href))
  const mailto = links.filter(l => /^mailto:/i.test(l.href))
  const phones = uniq([...tel.map(l => decodeURIComponent(l.href.slice(4))), ...(text.match(/(?:\+44\s?\(?0?\)?\s?\d{2,4}|\(?0\d{2,4}\)?)[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g) || [])]
    .map(cleanUkPhone).filter((x): x is string => !!x)).slice(0, 5)
  const emails = uniq([...mailto.map(l => l.href.slice(7).split('?')[0]), ...(text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])]
    .map(e => e.trim().toLowerCase().replace(/\.$/, ''))
    .filter(e => !/\.(png|jpe?g|gif|webp|svg)$/.test(e) && !/(sentry|wixpress|example\.|domain\.com|email\.com|yourname|@2x)/.test(e))).slice(0, 5)
  const whatsapp = uniq(links.map(l => l.href).filter(h => /wa\.me\/|api\.whatsapp\.com\/send|web\.whatsapp\.com\/send|^whatsapp:\/\/send/i.test(h))).slice(0, 5)

  const forms = Array.from(html.matchAll(/<form\b[\s\S]*?<\/form>/gi)).map(m => m[0])
  const contactForm = forms.some(f => {
    const head = (f.match(/<form[^>]*>/i)?.[0] || '').toLowerCase()
    if (/search/.test(head) && !/<textarea/i.test(f)) return false
    return /<textarea/i.test(f) || /type=["']?(email|tel)/i.test(f) || /contact|quote|enquir/.test(head)
  })
  const ctas = uniq(Array.from(html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)).map(m => stripTags(m[2])).filter(t => t && t.length <= 60 && CTA_RE.test(t))).slice(0, 8)

  const years = Array.from(text.matchAll(/(?:©|copyright|\(c\))\s*(?:[^\d]{0,40}?)((?:19|20)\d{2})(?:\s*[-–—/]\s*((?:19|20)\d{2}))?/gi))
    .flatMap(m => [m[1], m[2]].filter(Boolean).map(Number)).filter(y => y >= 1995 && y <= year + 1)

  const oldTech: string[] = []
  const jq = low.match(/jquery[.-]?(1\.\d+(?:\.\d+)?)(?:\.min)?\.js/)
  if (jq) oldTech.push(`jQuery ${jq[1]}`)
  if (/\.swf\b|shockwave-flash/.test(low)) oldTech.push('Adobe Flash')
  if (/<frameset|<frame\b/.test(low)) oldTech.push('HTML frames')
  if (/<marquee|<blink/.test(low)) oldTech.push('<marquee>/<blink> tags')
  if ((low.match(/<font[\s>]/g) || []).length >= 3) oldTech.push('<font> tags')
  if (/<!--\[if (lt )?ie [5-8]/.test(low)) oldTech.push('Internet Explorer conditional comments')
  if (generator && (/wordpress\s+[1-4]\./i.test(generator) || /joomla!?\s*1\.|frontpage|dreamweaver|iweb/i.test(generator))) oldTech.push(generator)

  const host = (() => { try { return new URL(baseUrl).hostname.replace(/^www\./, '') } catch { return '' } })()
  const servicePaths = new Set<string>()
  for (const l of links) {
    try {
      const u = new URL(l.href, baseUrl)
      if (u.hostname.replace(/^www\./, '') !== host) continue
      const label = `${l.text} ${u.pathname}`.toLowerCase()
      if (SERVICE_WORDS.some(w => label.includes(w))) servicePaths.add(u.pathname.replace(/\/$/, '') || label)
    } catch { /* link invalid */ }
  }
  const navHtml = (html.match(/<(nav|header)\b[\s\S]*?<\/\1>/gi) || []).join(' ')
  const ldTypes = Array.from(html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)).map(m => m[1])
  // tabel folosit ca layout de pagină (nu tabel de date): lat (100% / lățime fixă) și cu conținut de pagină în el
  const tablesLayout = (low.match(/<table[^>]+(width|bgcolor|cellpadding)=/g) || []).length >= 3
    || Array.from(low.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/g)).some(m => /width=["']?(100%|[6-9]\d\d\b|1\d{3}\b)/.test(m[1]) && /<(p|font|img|h[1-3]|table)\b/.test(m[2]) && !/<th\b/.test(m[2]))

  return {
    has_viewport: /width\s*=/i.test(vp),
    title: title || null,
    meta_description: desc || null,
    generator,
    h1_count: (html.match(/<h1\b/gi) || []).length,
    headings: Array.from(html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)).map(m => stripTags(m[1]).slice(0, 120)).filter(Boolean).slice(0, 12),
    phones, emails,
    tel_links: tel.length, mailto_links: mailto.length,
    whatsapp_links: whatsapp,
    whatsapp_widget: /elfsight-app|whatsapp-widget|wa-widget|joinchat|getbutton\.io|click-to-chat|wati\.io/.test(low),
    forms: forms.length, contact_form: contactForm,
    cta_texts: ctas, has_cta: ctas.length > 0 || tel.length > 0,
    local_seo: {
      mentions_city: !!city && text.toLowerCase().includes(city.toLowerCase()),
      has_postcode: /\b[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2}\b/i.test(text),
      local_business_schema: ldTypes.some(t => LOCAL_TYPES.includes(t)),
    },
    copyright_year: years.length ? Math.max(...years) : null,
    old_tech: oldTech,
    table_layout: !!tablesLayout,
    page_kb: Math.round(html.length / 102.4) / 10,
    nav_links: (navHtml.match(/<a\b/gi) || []).length,
    service_links: servicePaths.size,
  }
}

// ── Afaceri fără site în Google: verificăm câteva domenii probabile ──────────────────────
const STOP = new Set(['ltd', 'limited', 'the', 'and', 'co', 'uk', 'services', 'service', 'of', 'plc', 'llp', 'group'])
const tokens = (name: string) => name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t))

export function candidateDomains(name: string): string[] {
  const t = tokens(name)
  if (!t.length) return []
  return uniq([`${t.join('')}.co.uk`, `${t.join('')}.com`, `${t.join('-')}.co.uk`]).slice(0, 3)
}

function pageMatches(html: string, name: string, phone?: string | null): boolean {
  const low = html.toLowerCase()
  if (/domain is for sale|buy this domain|may be for sale|parked free|domain parking|coming soon|under construction/.test(low)) return false
  const digits = low.replace(/\D/g, '')
  if (phone) {
    let p = phone.replace(/\D/g, '')
    if (p.startsWith('44')) p = '0' + p.slice(2)
    if (p.length >= 10 && (digits.includes(p) || digits.includes(p.slice(1)))) return true
  }
  const t = tokens(name).filter(x => x.length > 2)
  if (!t.length) return false
  const text = low.replace(/[^a-z0-9 ]+/g, ' ')
  const hits = t.filter(x => new RegExp(`\\b${x}\\b`).test(text)).length
  return t.length > 1 ? hits >= Math.max(2, Math.round(t.length * 0.75)) : hits === 1 && t[0].length >= 5
}

// ── Auditul complet al unei afaceri ───────────────────────────────────────────────────
const NO_FETCH = ['facebook.com', 'fb.com', 'instagram.com', 'tiktok.com', 'linkedin.com', 'twitter.com', 'x.com', 'youtube.com', 'linktr.ee', 'checkatrade.com', 'yell.com', 'mybuilder.com', 'trustatrader.com', 'ratedpeople.com', 'bark.com', 'yelp.co.uk', 'yelp.com', 'nextdoor.co.uk', 'nextdoor.com', 'google.com', 'g.page', 'maps.app.goo.gl']

export async function quickAudit(b: { name: string; city: string | null; phone: string | null; website_url: string | null }, opts: { allowPrivate?: boolean; fetchImpl?: typeof fetch; pagespeedKey?: string } = {}): Promise<AuditFacts> {
  if (!b.website_url) {
    const cands = candidateDomains(b.name)
    const results = await Promise.all(cands.map(async d => {
      const r = await safeFetch(`https://${d}/`, opts)
      return r.ok && pageMatches(r.html, b.name, b.phone) ? r.finalUrl : null
    }))
    return { reachable: false, presence: { checked: true, candidates: cands, found_url: results.find(Boolean) || null } }
  }
  let url = b.website_url.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } })()
  if (NO_FETCH.some(d => host === d || host.endsWith('.' + d))) return { checked_url: url, reachable: false, error_kind: null }

  let r = await safeFetch(url, opts)
  if (!r.ok && r.errorKind === 'ssl' && url.startsWith('https://')) {
    const r2 = await safeFetch('http://' + url.slice(8), opts)
    if (r2.ok) r = r2
  }
  const base: AuditFacts = { checked_url: url, final_url: r.finalUrl, http_status: r.status, load_ms: r.ms, reachable: false }
  if (!r.ok) return { ...base, error_kind: r.errorKind || 'http_error' }
  if (r.contentType && !/html|xml/.test(r.contentType)) return { ...base, error_kind: 'http_error' }
  const facts: AuditFacts = { ...base, reachable: true, https: r.finalUrl.startsWith('https://'), ...extractFacts(r.html, r.finalUrl, b.city) }

  // PageSpeed (opțional): doar dacă există cheie pe server
  if (opts.pagespeedKey) {
    try {
      const u = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
      u.searchParams.set('url', r.finalUrl); u.searchParams.set('strategy', 'mobile'); u.searchParams.set('key', opts.pagespeedKey)
      for (const c of ['performance', 'accessibility', 'seo', 'best-practices']) u.searchParams.append('category', c)
      const ps = await (await fetch(u, { signal: AbortSignal.timeout(40_000) })).json() as { lighthouseResult?: { categories?: Record<string, { score?: number }>; audits?: Record<string, { numericValue?: number }> } }
      const cat = ps.lighthouseResult?.categories || {}
      const sc = (k: string) => (typeof cat[k]?.score === 'number' ? Math.round(cat[k].score! * 100) : null)
      const lcp = ps.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue
      facts.pagespeed = { fetched: sc('performance') != null, strategy: 'mobile', performance: sc('performance'), accessibility: sc('accessibility'), seo: sc('seo'), best_practices: sc('best-practices'), lcp_ms: lcp ? Math.round(lcp) : null }
    } catch {
      facts.pagespeed = { fetched: false, strategy: 'mobile', error: 'PageSpeed request failed' }
    }
  }
  return facts
}

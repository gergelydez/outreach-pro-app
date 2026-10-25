import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

// Analizează site-ul actual al unei afaceri: cât de vechi/stricat arată
// (euristici, fără cost AI) + extrage conținutul real (texte, servicii,
// email, imagini) pe care se bazează redesign-ul.

const UA = 'Mozilla/5.0 (compatible; OutreachProAudit/1.0; +site-redesign-concept)'
const TIMEOUT_MS = 12000
const MAX_HTML = 3_000_000

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true
  return false
}

// Urmărim redirect-urile manual ca să nu ajungem pe adrese interne
async function safeFetch(url: string): Promise<{ res: Response; finalUrl: string }> {
  let current = url
  for (let hop = 0; hop < 5; hop++) {
    const u = new URL(current)
    if (!['http:', 'https:'].includes(u.protocol) || isPrivateHost(u.hostname)) {
      throw new Error('URL nepermis')
    }
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'ro,en;q=0.8' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString()
      continue
    }
    return { res, finalUrl: current }
  }
  throw new Error('Prea multe redirect-uri')
}

async function readText(res: Response): Promise<string> {
  const buf = await res.arrayBuffer()
  return new TextDecoder('utf-8').decode(buf.slice(0, MAX_HTML))
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function stripTags(html: string): string {
  return decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function abs(src: string, base: string): string {
  try { return new URL(src, base).toString() } catch { return '' }
}

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)) }

function extractEmails(html: string): string[] {
  const found = (html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])
    .map(e => e.toLowerCase())
    .filter(e => !/\.(png|jpe?g|gif|webp|svg)$/.test(e))
    .filter(e => !/(sentry|wixpress|example\.|domain\.|email\.com|yourname|@2x)/.test(e))
  return uniq(found).slice(0, 5)
}

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'Lipsă URL' }, { status: 400 })

  const target = /^https?:\/\//i.test(url) ? url : `http://${url}`
  const year = new Date().getFullYear()
  const issues: string[] = []
  let score = 0

  const t0 = Date.now()
  let html = ''
  let finalUrl = target
  let reachable = true
  try {
    const { res, finalUrl: f } = await safeFetch(target)
    finalUrl = f
    html = await readText(res)
    if (res.status >= 400) {
      reachable = false
      issues.push(`Site-ul răspunde cu eroare ${res.status} — clienții văd o pagină stricată`)
      score += 70
    }
  } catch (err) {
    reachable = false
    const msg = err instanceof Error ? err.message : String(err)
    issues.push(msg === 'URL nepermis'
      ? 'Adresa site-ului nu poate fi verificată'
      : 'Site-ul nu se încarcă (expirat, căzut sau foarte lent)')
    score += 80
  }
  const loadMs = Date.now() - t0
  const htmlKb = Math.round(html.length / 1024)
  const low = html.toLowerCase()

  const https = finalUrl.startsWith('https://')
  if (reachable && !https) { issues.push('Fără HTTPS — Chrome afișează „Nesigur" lângă adresă'); score += 15 }

  const mobile = /<meta[^>]+name=["']?viewport/i.test(html)
  if (html && !mobile) { issues.push('Nu e adaptat pentru telefon (pe mobil textul e mic și trebuie mărit)'); score += 25 }

  // Ultimul an de copyright din pagină
  const years = Array.from(low.matchAll(/(?:©|&copy;|copyright)[^<]{0,40}?((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/g))
    .map(m => Number(m[2] || m[1]))
    .filter(y => y >= 1995 && y <= year)
  const copyrightYear = years.length ? Math.max(...years) : null
  if (copyrightYear && copyrightYear <= year - 3) {
    issues.push(`Pare neactualizat din ${copyrightYear}`)
    score += copyrightYear <= year - 6 ? 20 : 12
  }

  // Tehnologie veche
  const oldTech: string[] = []
  if (/\.swf\b|shockwave-flash/.test(low)) oldTech.push('Flash')
  if (/jquery[-.]?1\.\d/.test(low)) oldTech.push('jQuery 1.x')
  if (/<font[\s>]|<marquee|<center>|<frameset/.test(low)) oldTech.push('HTML din anii 2000')
  if ((low.match(/<table[^>]+(width|bgcolor|cellpadding)=/g) || []).length >= 3) oldTech.push('layout pe tabele')
  const gen = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1] || ''
  if (/frontpage|dreamweaver|joomla!?\s*1\.|wordpress\s*[2-4]\./i.test(gen)) oldTech.push(gen.split(' - ')[0].trim())
  if (oldTech.length) { issues.push(`Tehnologie depășită: ${uniq(oldTech).join(', ')}`); score += Math.min(25, oldTech.length * 12) }

  if (/under construction|în construcție|in constructie|coming soon|site în lucru|domain (is )?for sale|parked/i.test(low.slice(0, 20000))) {
    issues.push('Site „în construcție" / pagină parcată'); score += 45
  }

  if (reachable && (loadMs > 4000 || htmlKb > 2500)) {
    issues.push(`Se încarcă greu (${(loadMs / 1000).toFixed(1)}s)`); score += 10
  }

  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim()
  const description = decodeEntities(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] || '').trim()
  if (html && !description) { issues.push('Lipsește descrierea pentru Google (apar mai jos în căutări)'); score += 5 }
  if (html && !title) { issues.push('Pagina nu are titlu'); score += 5 }
  if (html && !/href=["']tel:/i.test(html)) { issues.push('Telefonul nu e clickabil pe mobil'); score += 5 }

  // ── Conținut real ──────────────────────────────────────────────────────
  const headings = uniq(Array.from(html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi))
    .map(m => stripTags(m[1])).filter(h => h.length > 2 && h.length < 120)).slice(0, 25)
  const textExcerpt = stripTags(html.replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')).slice(0, 6000)

  let emails = extractEmails(html)
  // Emailul e des doar pe pagina de contact — o singură cerere în plus
  if (!emails.length && html) {
    const contactHref = html.match(/href=["']([^"']*contact[^"']*)["']/i)?.[1]
    const contactUrl = contactHref ? abs(contactHref, finalUrl) : ''
    if (contactUrl && contactUrl.startsWith('http')) {
      try {
        const { res } = await safeFetch(contactUrl)
        emails = extractEmails(await readText(res))
      } catch {}
    }
  }

  const phones = uniq(Array.from(html.matchAll(/href=["']tel:([^"']+)/gi)).map(m => decodeURIComponent(m[1]).trim())).slice(0, 3)
  const socials = uniq(Array.from(html.matchAll(/href=["'](https?:\/\/(?:www\.)?(?:facebook|instagram|tiktok|youtube|linkedin)\.com\/[^"'?#]+)/gi))
    .map(m => m[1])).filter(s => !/sharer|share\.php|intent/.test(s)).slice(0, 5)

  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || ''
  const imgTags = Array.from(html.matchAll(/<img[^>]+>/gi)).map(m => m[0])
  const logoTag = imgTags.find(t => /logo/i.test(t))
  const logoSrc = logoTag?.match(/src=["']([^"']+)/i)?.[1] || ''
  const images = uniq(imgTags
    .map(t => t.match(/(?:data-src|src)=["']([^"']+)/i)?.[1] || '')
    .filter(s => s && !/logo|icon|sprite|pixel|tracking|\.svg|\.gif|data:/i.test(s))
    .map(s => abs(s, finalUrl))
    .filter(Boolean)).slice(0, 8)
  if (ogImage) images.unshift(abs(ogImage, finalUrl))

  return NextResponse.json({
    audit: {
      url: target,
      final_url: finalUrl,
      reachable,
      https,
      mobile_friendly: mobile,
      load_ms: loadMs,
      html_kb: htmlKb,
      copyright_year: copyrightYear,
      outdated_score: Math.min(100, score),
      issues,
      title,
      description,
      headings,
      text_excerpt: textExcerpt,
      emails,
      phones,
      socials,
      logo_url: logoSrc ? abs(logoSrc, finalUrl) : '',
      images: uniq(images).slice(0, 8),
      audited_at: new Date().toISOString(),
    },
  })
}

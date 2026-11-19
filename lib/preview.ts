// Utilitare comune pentru preview-urile de redesign (server + client).

export function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'site'
}

// Banner discret + noindex: preview-ul e clar un concept, nu site-ul oficial,
// și nu concurează în Google cu site-ul lor real.
export function withConceptBanner(html: string, businessName: string, designer: string, lang: 'ro' | 'en' | 'hu' = 'ro'): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const meta = '<meta name="robots" content="noindex,nofollow">'
  // Mic, în stânga jos, ca să nu acopere butoanele de contact ale site-ului (de obicei în dreapta jos)
  const t = lang === 'hu'
    ? { title: `Weboldal-terv: ${esc(businessName)}${designer ? `, készítette: ${esc(designer)}` : ''}`, label: `Terv${designer ? ` · ${esc(designer)}` : ''} · nem a hivatalos oldal`, close: 'Bezárás' }
    : lang === 'en'
    ? { title: `Website concept for ${esc(businessName)}${designer ? `, made by ${esc(designer)}` : ''}`, label: `Concept${designer ? ` by ${esc(designer)}` : ''} · not the official site`, close: 'Close' }
    : { title: `Concept de redesign pentru ${esc(businessName)}${designer ? `, realizat de ${esc(designer)}` : ''}`, label: `Concept${designer ? ` de ${esc(designer)}` : ''} · nu e site-ul oficial`, close: 'Închide' }
  const banner = `<div id="concept-banner" title="${t.title}" style="position:fixed;bottom:10px;left:10px;z-index:2147483647;background:rgba(15,23,42,.88);color:#e2e8f0;font:500 11px/1.3 system-ui,sans-serif;padding:6px 10px;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,.2);display:flex;gap:8px;align-items:center;max-width:min(60vw,320px)"><span>${t.label}</span><button onclick="this.parentNode.remove()" style="background:none;border:0;color:#94a3b8;cursor:pointer;font-size:14px" aria-label="${t.close}">✕</button></div>`

  let out = html.replace(/<meta name="robots"[^>]*>/gi, '')
  out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, m => `${m}\n${meta}`) : meta + out
  // pe telefon, deasupra barei fixe de jos (Sună / WhatsApp) a site-ului
  const bannerCss = '<style>@media (max-width:767px){#concept-banner{bottom:84px!important}}</style>'
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${bannerCss}${banner}\n</body>`) : out + bannerCss + banner
  return out
}

// Varianta finală pentru client: fără bannerul „concept” și fără noindex (site-ul live trebuie să apară pe Google)
export function stripConceptBanner(html: string): string {
  return html
    .replace(/<style>@media \(max-width:767px\)\{#concept-banner[^<]*<\/style>/g, '')
    .replace(/<div id="concept-banner"[\s\S]*?<\/button><\/div>\n?/g, '')
    .replace(/<meta name="robots" content="noindex,nofollow">\n?/gi, '')
}

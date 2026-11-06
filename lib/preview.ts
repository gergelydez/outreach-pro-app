// Utilitare comune pentru preview-urile de redesign (server + client).

export function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'site'
}

// Banner discret + noindex: preview-ul e clar un concept, nu site-ul oficial,
// și nu concurează în Google cu site-ul lor real.
export function withConceptBanner(html: string, businessName: string, designer: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const meta = '<meta name="robots" content="noindex,nofollow">'
  // Mic, în stânga jos, ca să nu acopere butoanele de contact ale site-ului (de obicei în dreapta jos)
  const banner = `<div id="concept-banner" title="Concept de redesign pentru ${esc(businessName)}${designer ? `, realizat de ${esc(designer)}` : ''}" style="position:fixed;bottom:10px;left:10px;z-index:2147483647;background:rgba(15,23,42,.88);color:#e2e8f0;font:500 11px/1.3 system-ui,sans-serif;padding:6px 10px;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,.2);display:flex;gap:8px;align-items:center;max-width:min(60vw,320px)"><span>Concept${designer ? ` de ${esc(designer)}` : ''} · nu e site-ul oficial</span><button onclick="this.parentNode.remove()" style="background:none;border:0;color:#94a3b8;cursor:pointer;font-size:14px" aria-label="Închide">✕</button></div>`

  let out = html.replace(/<meta name="robots"[^>]*>/gi, '')
  out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, m => `${m}\n${meta}`) : meta + out
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${banner}\n</body>`) : out + banner
  return out
}

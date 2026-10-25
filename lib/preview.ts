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
  const banner = `<div id="concept-banner" style="position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(15,23,42,.92);color:#f1f5f9;font:500 12px/1.4 system-ui,sans-serif;padding:8px 14px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;max-width:calc(100vw - 24px)"><span>Concept de redesign pentru <b>${esc(businessName)}</b>${designer ? ` · realizat de ${esc(designer)}` : ''} · nu este site-ul oficial</span><button onclick="this.parentNode.remove()" style="background:none;border:0;color:#94a3b8;cursor:pointer;font-size:14px" aria-label="Închide">✕</button></div>`

  let out = html.replace(/<meta name="robots"[^>]*>/gi, '')
  out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, m => `${m}\n${meta}`) : meta + out
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${banner}\n</body>`) : out + banner
  return out
}

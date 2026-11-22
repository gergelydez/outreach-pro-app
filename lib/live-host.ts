// Domeniile clienților (ex. hanulizvorulrece.ro) îndreptate spre aplicație: site-ul e servit direct de aici,
// așa că orice modificare (demo refăcut, reparații, editări) apare singură pe domeniu.

export const normHost = (h: string) => h.trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '')

// Domeniile aplicației însăși: acolo rămâne aplicația normală
export function isAppHost(host: string): boolean {
  const h = normHost(host)
  if (!h || h === 'localhost' || /^[\d.]+$/.test(h) || h.endsWith('.vercel.app') || h.endsWith('.local')) return true
  const own = [process.env.PUBLIC_APP_URL || '', ...(process.env.APP_HOSTS || '').split(',')]
    .map(x => x.trim()).filter(Boolean)
    .map(x => { try { return normHost(new URL(/^https?:\/\//.test(x) ? x : `https://${x}`).host) } catch { return '' } })
  return own.includes(h)
}

export function hostOfUrl(u: string | null): string | null {
  if (!u) return null
  try { return normHost(new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).host) } catch { return null }
}

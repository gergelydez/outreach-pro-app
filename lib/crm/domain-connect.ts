// „Pune site-ul pe domeniu” dintr-un singur buton: adaugă domeniul în proiectul Vercel și setează DNS-ul în Cloudflare.
// Necesită o singură dată, în Vercel: VERCEL_TOKEN și CLOUDFLARE_API_TOKEN (permisiune Zone → DNS → Edit).
import { normHost } from '@/lib/live-host'

export const VERCEL_IP = '76.76.21.21'
export const VERCEL_CNAME = 'cname.vercel-dns.com'

export function domainAutoAvailable() {
  return !!(process.env.VERCEL_TOKEN && process.env.CLOUDFLARE_API_TOKEN)
}

export function cleanDomain(input: string): string {
  const h = normHost(input.replace(/^https?:\/\//i, '').replace(/[/?#].*$/, ''))
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h)) throw new DomainError('Domeniul nu pare corect (ex. hanulizvorulrece.ro).')
  return h
}

export class DomainError extends Error {}

type F = typeof fetch

let teamCache: string | null | undefined
// Echipa în care e proiectul: VERCEL_TEAM_ID dacă e setat; altfel o caută singură (contul personal sau fiecare echipă)
export async function findTeam(f: F): Promise<string | null> {
  if (process.env.VERCEL_TEAM_ID) return process.env.VERCEL_TEAM_ID
  if (teamCache !== undefined) return teamCache
  const h = { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` }
  const p = encodeURIComponent(project())
  const direct = await f(`https://api.vercel.com/v9/projects/${p}`, { headers: h })
  if (direct.ok) return (teamCache = null)
  const teams = await f('https://api.vercel.com/v2/teams', { headers: h }).then(r => r.json()).catch(() => ({})) as { teams?: { id: string }[] }
  for (const t of teams.teams || []) {
    const r = await f(`https://api.vercel.com/v9/projects/${p}?teamId=${t.id}`, { headers: h })
    if (r.ok) return (teamCache = t.id)
  }
  throw new DomainError(`Vercel: nu găsesc proiectul „${project()}” cu acest token. Verifică la token ca „Scope” să fie echipa proiectului.`)
}

export async function vercel(f: F, path: string, init: RequestInit = {}) {
  const teamId = await findTeam(f)
  const team = teamId ? `${path.includes('?') ? '&' : '?'}teamId=${teamId}` : ''
  const res = await f(`https://api.vercel.com${path}${team}`, { ...init, headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' } })
  const data = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } } & Record<string, unknown>
  return { ok: res.ok, status: res.status, data }
}

async function cf(f: F, path: string, init: RequestInit = {}) {
  const res = await f(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' } })
  const data = await res.json().catch(() => ({})) as { success?: boolean; result?: unknown; errors?: { message: string }[] }
  if (!res.ok || data.success === false) throw new DomainError(`Cloudflare: ${data.errors?.[0]?.message || res.status}`)
  return data.result
}

export const resetTeamCache = () => { teamCache = undefined }
// Domeniul era atașat unui proiect Cloudflare Pages (site-ul vechi din arhivă): îl scoatem de acolo
async function detachFromPages(f: F, host: string) {
  const fail = (why = '') => new DomainError(`Domeniul ${host} e încă legat de site-ul vechi din Cloudflare Pages. Scoate-l o dată: Cloudflare → Workers & Pages → proiectul site-ului → Custom domains → ⋯ → Remove domain, apoi apasă din nou „Pune pe domeniu”.${why ? ` (Motiv: ${why})` : ''}`)
  let account = process.env.CLOUDFLARE_ACCOUNT_ID
  try {
    if (!account) account = ((await cf(f, '/accounts')) as { id: string }[])[0]?.id
    if (!account) throw fail('nu găsesc contul Cloudflare')
    const projects = await cf(f, `/accounts/${account}/pages/projects`) as { name: string; domains?: string[] }[]
    const p = projects.find(x => (x.domains || []).includes(host))
    if (!p) throw fail(`niciun proiect Pages din ${projects.length} nu are domeniul`)
    await cf(f, `/accounts/${account}/pages/projects/${p.name}/domains/${host}`, { method: 'DELETE' })
  } catch (e) {
    throw e instanceof DomainError && e.message.startsWith('Domeniul') ? e : fail((e as Error).message)
  }
}

export const project = () => process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME || 'outreach-pro-app'

export async function connectDomain(input: string, f: F = fetch) {
  if (!domainAutoAvailable()) throw new DomainError('setup')
  const apex = cleanDomain(input)
  const www = `www.${apex}`

  // 1) Cloudflare: domeniul trebuie să fie în cont
  const zones = await cf(f, `/zones?name=${encodeURIComponent(apex)}`) as { id: string }[]
  if (!zones?.length) throw new DomainError(`Domeniul ${apex} nu e în contul tău Cloudflare. Adaugă-l întâi în Cloudflare (Add a domain).`)
  const zone = zones[0].id

  // 2) Vercel: adaugă domeniul (și www → redirect spre domeniu) în proiect
  for (const body of [{ name: apex }, { name: www, redirect: apex, redirectStatusCode: 308 }]) {
    const r = await vercel(f, `/v10/projects/${encodeURIComponent(project())}/domains`, { method: 'POST', body: JSON.stringify(body) })
    const code = r.data.error?.code || ''
    if (!r.ok && !/already|exists|in_use/i.test(code + (r.data.error?.message || ''))) {
      throw new DomainError(r.status === 403 || r.status === 401 ? 'Vercel: tokenul nu are acces la proiect (verifică VERCEL_TOKEN / VERCEL_TEAM_ID).' : `Vercel: ${r.data.error?.message || r.status}`)
    }
  }

  // 3) Cloudflare DNS: înlocuiește ce era (ex. vechiul Cloudflare Pages) cu Vercel, „DNS only”
  for (const [name, type, content] of [[apex, 'A', VERCEL_IP], [www, 'CNAME', VERCEL_CNAME]] as const) {
    const existing = await cf(f, `/zones/${zone}/dns_records?name=${encodeURIComponent(name)}`) as { id: string; type: string; content: string; proxied?: boolean }[]
    const same = existing.find(x => x.type === type && x.content === content && !x.proxied)
    for (const x of existing) {
      if (x === same || !['A', 'AAAA', 'CNAME'].includes(x.type)) continue
      try { await cf(f, `/zones/${zone}/dns_records/${x.id}`, { method: 'DELETE' }) } catch (e) {
        // înregistrare blocată de un proiect Cloudflare Pages (domeniu atașat acolo): scoatem domeniul din Pages
        if (!/read.?only/i.test((e as Error).message)) throw e
        await detachFromPages(f, name)
        try { await cf(f, `/zones/${zone}/dns_records/${x.id}`, { method: 'DELETE' }) } catch (e2) { if (!/not found|does not exist|81044/i.test((e2 as Error).message)) throw e2 }
      }
    }
    if (!same) await cf(f, `/zones/${zone}/dns_records`, { method: 'POST', body: JSON.stringify({ type, name, content, proxied: false, ttl: 1, comment: 'site servit de aplicație' }) })
  }

  // 4) cere verificarea (certificatul HTTPS vine singur în câteva minute)
  const v = await vercel(f, `/v9/projects/${encodeURIComponent(project())}/domains/${apex}/verify`, { method: 'POST' })
  return { domain: apex, verified: !!v.data.verified }
}

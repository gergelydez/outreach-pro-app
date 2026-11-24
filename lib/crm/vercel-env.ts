// Preia setările Cloudflare R2 din celălalt proiect Vercel (dashboard), le pune în acest proiect,
// adaugă CRM_DB_SECRET (codul bazei de date = vechiul BLOB_READ_WRITE_TOKEN) și republică aplicația.
// Caută în contul personal și în toate echipele la care are acces tokenul; acceptă și numele R2_*.
import { vercel, project, DomainError } from './domain-connect'

const KEYS = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT'] as const
type Key = typeof KEYS[number]
// alte nume folosite pentru aceleași setări
const ALIASES: Record<Key, string[]> = {
  S3_BUCKET: ['S3_BUCKET', 'S3_BUCKET_NAME', 'R2_BUCKET', 'R2_BUCKET_NAME', 'CLOUDFLARE_R2_BUCKET', 'CLOUDFLARE_R2_BUCKET_NAME'],
  S3_ACCESS_KEY_ID: ['S3_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'],
  S3_SECRET_ACCESS_KEY: ['S3_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'],
  S3_ENDPOINT: ['S3_ENDPOINT', 'R2_ENDPOINT', 'CLOUDFLARE_R2_ENDPOINT', 'AWS_ENDPOINT_URL_S3'],
}
const ACCOUNT_KEYS = ['R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_R2_ACCOUNT_ID']
const STORAGE_HINT = /S3|R2|BUCKET|STORAGE|CLOUDFLARE/i

type F = typeof fetch
interface EnvRow { id: string; key: string; type: string; value?: string }

async function api(f: F, path: string, teamId: string | null, init: RequestInit = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await f(`https://api.vercel.com${path}${teamId ? `${sep}teamId=${teamId}` : ''}`, { ...init, headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' } })
  const data = await res.json().catch(() => ({})) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  return { ok: res.ok, status: res.status, data }
}

export async function adoptR2FromOtherProject(f: F = fetch) {
  if (!process.env.VERCEL_TOKEN) throw new DomainError('Lipsește VERCEL_TOKEN în Vercel (cel pus pentru domenii).')
  const own = await vercel(f, `/v9/projects/${encodeURIComponent(project())}`)
  if (!own.ok) throw new DomainError('Vercel: nu găsesc proiectul aplicației cu acest token.')
  const ownId = String(own.data.id)

  // toate locurile unde pot fi proiecte: contul personal + fiecare echipă
  const teams = await api(f, '/v2/teams?limit=50', null)
  const scopes: (string | null)[] = [null, ...(((teams.data.teams as { id: string }[]) || []).map(t => t.id))]
  const seen: string[] = []

  for (const scope of scopes) {
    const list = await api(f, '/v9/projects?limit=100', scope)
    for (const p of ((list.data.projects as { id: string; name: string }[]) || [])) {
      if (p.id === ownId || seen.some(s => s.startsWith(`${p.name}:`) || s === p.name)) continue
      const envs = await api(f, `/v9/projects/${p.id}/env`, scope)
      const rows = (envs.data.envs as EnvRow[]) || []
      const hints = Array.from(new Set(rows.map(r => r.key).filter(k => STORAGE_HINT.test(k))))
      seen.push(hints.length ? `${p.name}: ${hints.join(', ')}` : p.name)
      const find = (names: string[]) => names.map(n => rows.find(r => r.key === n)).find(Boolean)
      if (!find(ALIASES.S3_BUCKET)) continue

      const read = async (r: EnvRow | undefined) => {
        if (!r) return ''
        const one = await api(f, `/v1/projects/${p.id}/env/${r.id}`, scope)
        return typeof one.data.value === 'string' ? one.data.value.trim() : ''
      }
      const values = {} as Record<Key, string>
      for (const k of KEYS) values[k] = await read(find(ALIASES[k]))
      // endpointul R2 se poate construi din ID-ul contului Cloudflare
      if (!values.S3_ENDPOINT) {
        const acc = (await read(find(ACCOUNT_KEYS))) || (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim()
        if (acc) values.S3_ENDPOINT = `https://${acc}.r2.cloudflarestorage.com`
      }
      const missing = KEYS.filter(k => !values[k])
      if (missing.length) throw new DomainError(`Proiectul „${p.name}” are setările R2, dar nu pot citi: ${missing.join(', ')} (probabil sunt marcate „Sensitive” în Vercel). Pe acestea trebuie copiate de mână.`)

      const items = [...KEYS.map(k => ({ key: k as string, value: values[k] })), ...(process.env.BLOB_READ_WRITE_TOKEN && !process.env.CRM_DB_SECRET ? [{ key: 'CRM_DB_SECRET', value: process.env.BLOB_READ_WRITE_TOKEN }] : [])]
      const put = await vercel(f, `/v10/projects/${ownId}/env?upsert=true`, { method: 'POST', body: JSON.stringify(items.map(i => ({ ...i, type: 'encrypted', target: ['production', 'preview'] }))) })
      if (!put.ok) throw new DomainError(`Vercel: nu am putut salva setările (${put.data.error?.message || put.status}).`)
      let redeployed = false
      if (process.env.VERCEL_DEPLOYMENT_ID) {
        const d = await vercel(f, '/v13/deployments?forceNew=1', { method: 'POST', body: JSON.stringify({ name: String(own.data.name || project()), deploymentId: process.env.VERCEL_DEPLOYMENT_ID, target: 'production' }) })
        redeployed = d.ok
      }
      return { from: p.name, keys: items.map(i => i.key), redeployed }
    }
  }
  throw new DomainError(`Nu am găsit setările R2 (bucket + chei) în niciun proiect Vercel la care are acces cheia. Proiecte verificate: ${seen.length ? seen.join(' · ') : 'niciunul'}. Dacă dashboard-ul e în alt cont Vercel, cheia VERCEL_TOKEN trebuie să aibă acces și acolo (Scope: Full Account).`)
}

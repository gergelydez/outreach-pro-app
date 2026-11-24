// Preia setările Cloudflare R2 (S3_*) din celălalt proiect Vercel (dashboard), le pune în acest proiect,
// adaugă CRM_DB_SECRET (codul bazei de date = vechiul BLOB_READ_WRITE_TOKEN) și republică aplicația.
import { vercel, project, DomainError } from './domain-connect'

const KEYS = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT'] as const
type F = typeof fetch
interface EnvRow { id: string; key: string; type: string; value?: string }

export async function adoptR2FromOtherProject(f: F = fetch) {
  if (!process.env.VERCEL_TOKEN) throw new DomainError('Lipsește VERCEL_TOKEN în Vercel (cel pus pentru domenii).')
  const own = await vercel(f, `/v9/projects/${encodeURIComponent(project())}`)
  if (!own.ok) throw new DomainError('Vercel: nu găsesc proiectul aplicației cu acest token.')
  const ownId = String(own.data.id)
  const list = await vercel(f, '/v9/projects?limit=100')
  const projects = ((list.data.projects as { id: string; name: string }[]) || []).filter(p => p.id !== ownId)

  for (const p of projects) {
    const envs = await vercel(f, `/v9/projects/${p.id}/env`)
    const rows = ((envs.data.envs as EnvRow[]) || []).filter(e => (KEYS as readonly string[]).includes(e.key))
    if (!rows.some(r => r.key === 'S3_BUCKET')) continue
    const values: Record<string, string> = {}
    for (const r of rows) {
      if (values[r.key]) continue
      const one = await vercel(f, `/v1/projects/${p.id}/env/${r.id}`)
      const v = typeof one.data.value === 'string' ? one.data.value : ''
      if (v) values[r.key] = v
    }
    const missing = KEYS.filter(k => !values[k])
    if (missing.length) throw new DomainError(`Proiectul „${p.name}” are setările R2, dar nu pot citi: ${missing.join(', ')} (sunt marcate „Sensitive” în Vercel). Pe acestea trebuie copiate de mână.`)
    const items = [...KEYS.map(k => ({ key: k, value: values[k] })), ...(process.env.BLOB_READ_WRITE_TOKEN && !process.env.CRM_DB_SECRET ? [{ key: 'CRM_DB_SECRET', value: process.env.BLOB_READ_WRITE_TOKEN }] : [])]
    const put = await vercel(f, `/v10/projects/${ownId}/env?upsert=true`, { method: 'POST', body: JSON.stringify(items.map(i => ({ ...i, type: 'encrypted', target: ['production', 'preview'] }))) })
    if (!put.ok) throw new DomainError(`Vercel: nu am putut salva setările (${put.data.error?.message || put.status}).`)
    // republicăm ultima versiune, ca noile setări să intre în vigoare
    let redeployed = false
    if (process.env.VERCEL_DEPLOYMENT_ID) {
      const d = await vercel(f, '/v13/deployments?forceNew=1', { method: 'POST', body: JSON.stringify({ name: String(own.data.name || project()), deploymentId: process.env.VERCEL_DEPLOYMENT_ID, target: 'production' }) })
      redeployed = d.ok
    }
    return { from: p.name, keys: items.map(i => i.key), redeployed }
  }
  throw new DomainError('Nu am găsit niciun proiect Vercel cu setările R2 (S3_BUCKET).')
}

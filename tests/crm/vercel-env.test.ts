import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { adoptR2FromOtherProject } from '@/lib/crm/vercel-env'
import { resetTeamCache } from '@/lib/crm/domain-connect'

type Call = { url: string; method: string; body?: unknown }

function fakeVercel(opts: { sensitive?: boolean } = {}) {
  const calls: Call[] = []
  const envs: Record<string, { id: string; key: string; type: string; value: string }[]> = {
    p_dash: [
      { id: 'e1', key: 'S3_BUCKET', type: 'encrypted', value: 'shared-bucket' },
      { id: 'e2', key: 'S3_ACCESS_KEY_ID', type: 'encrypted', value: 'AKID' },
      { id: 'e3', key: 'S3_SECRET_ACCESS_KEY', type: opts.sensitive ? 'sensitive' : 'encrypted', value: 'SECRET' },
      { id: 'e4', key: 'S3_ENDPOINT', type: 'encrypted', value: 'https://acc.r2.cloudflarestorage.com' },
      { id: 'e5', key: 'SHOPIFY_DOMAIN', type: 'encrypted', value: 'x' },
    ],
    p_other: [],
  }
  const f = (async (url: string, init: RequestInit = {}) => {
    const method = init.method || 'GET'
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined })
    const j = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status })
    const u = new URL(url)
    if (u.pathname === '/v9/projects/outreach-pro-app') return j({ id: 'p_own', name: 'outreach-pro-app' })
    if (u.pathname === '/v9/projects') return j({ projects: [{ id: 'p_own', name: 'outreach-pro-app' }, { id: 'p_other', name: 'blog' }, { id: 'p_dash', name: 'dashbord-profit' }] })
    const list = u.pathname.match(/^\/v9\/projects\/(\w+)\/env$/)
    if (list) return j({ envs: (envs[list[1]] || []).map(({ value, ...e }) => e) })
    const one = u.pathname.match(/^\/v1\/projects\/(\w+)\/env\/(\w+)$/)
    if (one) { const e = envs[one[1]].find(x => x.id === one[2])!; return j(e.type === 'sensitive' ? { ...e, value: '' } : e) }
    if (u.pathname === '/v10/projects/p_own/env' && method === 'POST') return j({ created: [] })
    if (u.pathname === '/v13/deployments') return j({ id: 'dpl_new' })
    return j({ error: { message: 'nf' } }, 404)
  }) as unknown as typeof fetch
  return { f, calls }
}

describe('adopt R2 settings from the dashboard project', () => {
  beforeEach(() => { resetTeamCache(); Object.assign(process.env, { VERCEL_TOKEN: 't', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_abc', VERCEL_DEPLOYMENT_ID: 'dpl_old' }) })
  afterEach(() => { for (const k of ['VERCEL_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'VERCEL_DEPLOYMENT_ID']) delete process.env[k] })

  it('copies the 4 S3 values + CRM_DB_SECRET into this project and redeploys', async () => {
    const { f, calls } = fakeVercel()
    const r = await adoptR2FromOtherProject(f)
    expect(r).toEqual({ from: 'dashbord-profit', keys: ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT', 'CRM_DB_SECRET'], redeployed: true })
    const saved = calls.find(c => c.url.includes('/v10/projects/p_own/env'))!.body as { key: string; value: string }[]
    expect(Object.fromEntries(saved.map(x => [x.key, x.value]))).toEqual({ S3_BUCKET: 'shared-bucket', S3_ACCESS_KEY_ID: 'AKID', S3_SECRET_ACCESS_KEY: 'SECRET', S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com', CRM_DB_SECRET: 'vercel_blob_rw_abc' })
    expect((calls.find(c => c.url.includes('/v13/deployments'))!.body as { deploymentId: string }).deploymentId).toBe('dpl_old')
  })

  it('a "Sensitive" value that cannot be read gives a clear message', async () => {
    await expect(adoptR2FromOtherProject(fakeVercel({ sensitive: true }).f)).rejects.toThrow(/S3_SECRET_ACCESS_KEY/)
  })
})

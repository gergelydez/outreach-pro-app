import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { connectDomain, cleanDomain } from '@/lib/crm/domain-connect'

type Call = { url: string; method: string; body?: unknown }

function fakeFetch(opts: { zones?: unknown[]; records?: Record<string, unknown[]>; vercelErr?: { status: number; code: string } } = {}) {
  const calls: Call[] = []
  const f = (async (url: string, init: RequestInit = {}) => {
    const method = init.method || 'GET'
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined })
    const ok = (result: unknown) => new Response(JSON.stringify({ success: true, result }), { status: 200 })
    if (url.includes('api.cloudflare.com')) {
      if (url.includes('/zones?name=')) return ok(opts.zones ?? [{ id: 'z1' }])
      if (method === 'GET' && url.includes('dns_records?name=')) return ok(opts.records?.[decodeURIComponent(url.split('name=')[1])] ?? [])
      return ok({})
    }
    if (url.includes('/verify')) return new Response(JSON.stringify({ verified: true }))
    if (opts.vercelErr) return new Response(JSON.stringify({ error: { code: opts.vercelErr.code, message: opts.vercelErr.code } }), { status: opts.vercelErr.status })
    return new Response(JSON.stringify({ name: 'x' }))
  }) as unknown as typeof fetch
  return { f, calls }
}

describe('connectDomain', () => {
  beforeEach(() => { process.env.VERCEL_TOKEN = 'v'; process.env.CLOUDFLARE_API_TOKEN = 'c' })
  afterEach(() => { delete process.env.VERCEL_TOKEN; delete process.env.CLOUDFLARE_API_TOKEN })

  it('cleans user input', () => {
    expect(cleanDomain('https://www.HanulIzvorulRece.ro/')).toBe('hanulizvorulrece.ro')
    expect(() => cleanDomain('hanul')).toThrow()
  })

  it('adds both hosts in Vercel and replaces the old DNS records', async () => {
    const { f, calls } = fakeFetch({ records: { 'hanul.ro': [{ id: 'old', type: 'CNAME', content: 'hanul.pages.dev', proxied: true }, { id: 'mx', type: 'MX', content: 'mail' }] } })
    const r = await connectDomain('hanul.ro', f)
    expect(r).toEqual({ domain: 'hanul.ro', verified: true })
    const vercelAdds = calls.filter(c => c.url.includes('api.vercel.com') && c.url.endsWith('/domains'))
    expect(vercelAdds.map(c => (c.body as { name: string }).name)).toEqual(['hanul.ro', 'www.hanul.ro'])
    expect(calls.some(c => c.method === 'DELETE' && c.url.endsWith('/old'))).toBe(true)
    expect(calls.some(c => c.method === 'DELETE' && c.url.endsWith('/mx'))).toBe(false)
    const created = calls.filter(c => c.method === 'POST' && c.url.endsWith('/dns_records')).map(c => c.body)
    expect(created).toEqual([
      expect.objectContaining({ type: 'A', name: 'hanul.ro', content: '76.76.21.21', proxied: false }),
      expect.objectContaining({ type: 'CNAME', name: 'www.hanul.ro', content: 'cname.vercel-dns.com', proxied: false }),
    ])
  })

  it('domain already in the project is fine; missing Cloudflare zone is a clear error', async () => {
    await expect(connectDomain('hanul.ro', fakeFetch({ vercelErr: { status: 409, code: 'domain_already_in_use' } }).f)).resolves.toBeTruthy()
    await expect(connectDomain('hanul.ro', fakeFetch({ zones: [] }).f)).rejects.toThrow(/nu e în contul tău Cloudflare/)
  })

  it('without tokens asks for the one-time setup', async () => {
    delete process.env.VERCEL_TOKEN
    await expect(connectDomain('hanul.ro', fakeFetch().f)).rejects.toThrow('setup')
  })
})

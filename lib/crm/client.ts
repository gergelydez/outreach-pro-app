'use client'

// Client pentru API-ul CRM din browser: erorile de configurare (503 + setup) sunt
// păstrate, ca paginile să afișeze ce lipsește în loc de date false.
import { useCallback, useEffect, useState } from 'react'

export class ApiError extends Error {
  constructor(message: string, public status: number, public setup?: string) { super(message) }
}

// Cheia Claude salvată în pagina Setări a aplicației (ca la uneltele RO/HU) — folosită de server
// doar dacă ANTHROPIC_API_KEY nu e setată în Vercel. Se trimite numai către /api/crm/ai.
export function browserAnthropicKey(): string {
  if (typeof window === 'undefined') return ''
  try { return (JSON.parse(localStorage.getItem('biz_settings') || '{}').anthropicApiKey as string) || '' } catch { return '' }
}

export async function api<T = any>(path: string, opts: { method?: string; json?: unknown } = {}): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const headers: Record<string, string> = {}
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json'
  if (path.startsWith('/api/crm/ai') && browserAnthropicKey()) headers['x-anthropic-key'] = browserAnthropicKey()
  const method = opts.method || (opts.json !== undefined ? 'POST' : 'GET')
  let res: Response | null = null
  // citirile se reîncearcă automat dacă pică conexiunea (internet slab, server care pornește, deploy în curs)
  const tries = method === 'GET' ? 3 : 1
  for (let i = 0; i < tries; i++) {
    try {
      res = await fetch(path, { method, headers, body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined, cache: 'no-store' })
      if (method === 'GET' && (res.status === 502 || res.status === 503 || res.status === 504) && i < tries - 1 && !res.headers.get('content-type')?.includes('json')) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1))); continue
      }
      break
    } catch {
      if (i < tries - 1) { await new Promise(r => setTimeout(r, 1500 * (i + 1))); continue }
      throw new ApiError('Could not reach the server (weak connection, or the app is restarting after an update). Tap Retry.', 0)
    }
  }
  if (!res) throw new ApiError('Could not reach the server. Tap Retry.', 0)
  if (res.status === 401 && typeof window !== 'undefined' && !path.includes('/auth/')) {
    window.location.href = `/crm/login?next=${encodeURIComponent(window.location.pathname)}`
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const fallback = res.status === 504 ? 'The server took too long to answer (timeout). Tap Retry.' : `Request failed (${res.status})`
    throw new ApiError(data.error || fallback, res.status, data.setup)
  }
  return data as T
}

export function useApi<T = any>(path: string | null) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(!!path)
  const load = useCallback(async () => {
    if (!path) return
    setLoading(true)
    try { setData(await api<T>(path)); setError(null) }
    catch (e) { setError(e instanceof ApiError ? e : new ApiError(String(e), 0)) }
    setLoading(false)
  }, [path])
  useEffect(() => { load() }, [load])
  return { data, error, loading, reload: load, setData }
}

export const gbp = (n: number | string | null | undefined) =>
  n == null || n === '' ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(Number(n))

export const dateUk = (d: string | null | undefined, withTime = false) =>
  d ? new Date(d).toLocaleString('en-GB', withTime ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const relative = (d: string | null | undefined) => {
  if (!d) return '—'
  const diff = (Date.now() - new Date(d).getTime()) / 1000
  const fut = diff < 0, s = Math.abs(diff)
  const v = s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`
  return v === 'just now' ? v : fut ? `in ${v}` : `${v} ago`
}

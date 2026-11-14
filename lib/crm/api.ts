// Ajutoare pentru rutele API ale CRM: răspunsuri JSON, erori sigure, validare simplă.
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { CrmSetupError, withDbSession } from './db'
import { AiConfigError, AiRateLimitError } from './ai'
import { ProviderError } from './providers/google-places'

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

// Mesajele interne (SQL, stack) nu ajung în browser; doar erori cunoscute, formulate clar
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      // cererea poate fi re-executată (conflict la salvarea în Blob) → corpul trebuie citit din nou,
      // așa că fiecare încercare primește o copie a cererii originale
      const [first, ...rest] = args
      return await withDbSession(() => fn(...((first instanceof Request ? [first.clone(), ...rest] : args) as A)))
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status)
      if (e instanceof CrmSetupError) return json({ error: e.message, setup: e.missing }, 503)
      if (e instanceof AiConfigError) return json({ error: e.message, setup: 'ANTHROPIC_API_KEY' }, 503)
      if (e instanceof AiRateLimitError) return json({ error: e.message }, 429)
      if (e instanceof ProviderError) return json({ error: e.message }, e.status === 503 ? 503 : 502)
      if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Claude rejected the API key. Check ANTHROPIC_API_KEY in Vercel and redeploy.' }, 502)
      if (e instanceof Anthropic.PermissionDeniedError) return json({ error: 'This Anthropic key has no access to the configured model (CLAUDE_MODEL).' }, 502)
      if (e instanceof Anthropic.NotFoundError) return json({ error: 'The configured CLAUDE_MODEL was not found for this API key.' }, 502)
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'Too many Claude requests right now (or credit limit reached). Wait a minute and try again.' }, 429)
      if (e instanceof Anthropic.APIError) return json({ error: `Claude error ${e.status ?? ''}: ${e.message}`.trim() }, 502)
      const code = (e as { code?: string })?.code
      if (code === '42P01') return json({ error: 'Database tables are missing. Open Settings & API and run the database setup.', setup: 'MIGRATIONS' }, 503)
      console.error('[crm]', e)
      return json({ error: 'Something went wrong. Check the server logs.' }, 500)
    }
  }
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T } catch { throw new HttpError(400, 'Invalid JSON body') }
}

export function str(v: unknown, max = 500): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

export function int(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : def
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export function requireUuid(v: unknown): string {
  if (!isUuid(v)) throw new HttpError(400, 'Invalid id')
  return v
}

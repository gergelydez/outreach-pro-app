import { Pool } from 'pg'
import { MIGRATIONS } from './migrations'

// Acces la Postgres printr-o interfață minimă (query + tranzacție), ca aceeași
// logică să ruleze pe `pg` în producție și pe PGlite în teste.

export interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> // eslint-disable-line @typescript-eslint/no-explicit-any
}
export interface Database extends Queryable {
  transaction: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>
}

export class CrmSetupError extends Error {
  constructor(public missing: string, message?: string) {
    super(message || `Configurare lipsă: ${missing}`)
  }
}

let current: Database | null = null
let pool: Pool | null = null

export function setDatabase(database: Database | null) { current = database }

export function db(): Database {
  if (current) return current
  const url = process.env.DATABASE_URL
  if (!url) throw new CrmSetupError('DATABASE_URL', 'Baza de date nu e configurată (DATABASE_URL lipsește).')
  // Pool mic: pe serverless fiecare instanță are propriul pool
  pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX || 3), idleTimeoutMillis: 10_000 })
  const p = pool
  current = {
    query: (text, params) => p.query(text, params as unknown[]),
    transaction: async fn => {
      const client = await p.connect()
      try {
        await client.query('BEGIN')
        const out = await fn({ query: (t, ps) => client.query(t, ps as unknown[]) })
        await client.query('COMMIT')
        return out
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    },
  }
  return current
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = [], on: Queryable = db()): Promise<T[]> {
  return (await on.query(text, params)).rows as T[]
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = [], on: Queryable = db()): Promise<T | null> {
  return (await q<T>(text, params, on))[0] ?? null
}

export async function runMigrations(database: Database = db()): Promise<string[]> {
  await database.query(`CREATE TABLE IF NOT EXISTS crm_schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const done = new Set((await database.query('SELECT id FROM crm_schema_migrations')).rows.map(r => r.id as string))
  const applied: string[] = []
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue
    await database.transaction(async tx => {
      for (const stmt of splitSql(m.sql)) await tx.query(stmt)
      await tx.query('INSERT INTO crm_schema_migrations (id) VALUES ($1)', [m.id])
    })
    applied.push(m.id)
  }
  return applied
}

export async function pendingMigrations(database: Database = db()): Promise<string[]> {
  try {
    const done = new Set((await database.query('SELECT id FROM crm_schema_migrations')).rows.map(r => r.id as string))
    return MIGRATIONS.filter(m => !done.has(m.id)).map(m => m.id)
  } catch {
    return MIGRATIONS.map(m => m.id)
  }
}

// Instrucțiunile din migrații nu conțin ';' în string-uri sau funcții, deci împărțirea simplă e sigură
function splitSql(sql: string): string[] {
  return sql.split(/;\s*\n/).map(s => s.replace(/--[^\n]*/g, '').trim()).filter(Boolean)
}

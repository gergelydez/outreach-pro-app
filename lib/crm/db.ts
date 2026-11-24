import { Pool } from 'pg'
import { MIGRATIONS } from './migrations'
import { SnapshotDatabase, vercelBlobStore, r2Store } from './blob-db'
import { r2Configured } from '@/lib/object-store'

// Acces la Postgres printr-o interfață minimă (query + tranzacție). Două variante:
// 1) implicit: baza de date ținută în Vercel Blob-ul existent (BLOB_READ_WRITE_TOKEN), vezi blob-db.ts
// 2) opțional: un server Postgres extern, dacă setezi DATABASE_URL (Supabase/Neon)
// În teste se folosește PGlite direct (setDatabase).

export interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> // eslint-disable-line @typescript-eslint/no-explicit-any
}
export interface Database extends Queryable {
  transaction: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>
  // dacă există: încadrează o cerere HTTP (sincronizare la început, salvare la final)
  session?: <T>(fn: () => Promise<T>) => Promise<T>
}

export type StorageKind = 'postgres' | 'vercel_blob' | 'none'
export function storageKind(): StorageKind {
  if (process.env.DATABASE_URL) return 'postgres'
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'vercel_blob'
  return 'none'
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
  if (!url) {
    if (!process.env.BLOB_READ_WRITE_TOKEN && !r2Configured()) throw new CrmSetupError('BLOB_READ_WRITE_TOKEN', 'No storage configured: connect the Vercel Blob store to this project (Vercel → Storage → Blob → Connect), then redeploy.')
    current = new SnapshotDatabase(r2Configured() ? r2Store() : vercelBlobStore(), runMigrations)
    return current
  }
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

// Rulează o cerere HTTP într-o sesiune de bază de date (necesar pentru varianta Blob)
export async function withDbSession<T>(fn: () => Promise<T>): Promise<T> {
  let d: Database
  try { d = db() } catch { return fn() } // fără configurare: handler-ul arată mesajul de setup
  return d.session ? d.session(fn) : fn()
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

// Baza de date a CRM-ului ținută în Vercel Blob-ul existent (același BLOB_READ_WRITE_TOKEN
// folosit pentru previzualizările „Rebuild”), fără un server Postgres separat.
//
// Cum funcționează:
// - rulăm Postgres real în proces (PGlite, WebAssembly) — aceleași interogări SQL ca pe Postgres;
// - starea completă a bazei e un fișier (snapshot comprimat + criptat AES-256-GCM) în Blob;
// - la începutul fiecărei cereri verificăm dacă snapshot-ul s-a schimbat (GET condiționat cu ETag,
//   304 = nimic de descărcat); la final, doar dacă cererea a modificat date, încărcăm snapshot-ul nou;
// - scrierea folosește ifMatch (ETag): dacă între timp altă instanță a salvat, renunțăm la
//   modificările locale, reîncărcăm și re-executăm cererea (concurență optimistă) — nu se pierde nimic.
// Potrivit pentru un singur utilizator și volume mici (sute–mii de lead-uri).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import type { PGlite as PGliteType } from '@electric-sql/pglite'
import type { Database, Queryable } from './db'

export class SnapshotConflict extends Error {}

export interface SnapshotStore {
  // null = nu există încă; notModified = etag-ul dat e încă actual
  load(etag: string | null): Promise<{ notModified: true } | { notModified: false; data: Buffer; etag: string } | null>
  save(data: Buffer, etag: string | null): Promise<string> // aruncă SnapshotConflict
}

function secret(): string {
  return process.env.CRM_DB_SECRET || process.env.BLOB_READ_WRITE_TOKEN || ''
}

// Calea conține un hash al secretului: nu poate fi ghicită chiar dacă store-ul e public
export function snapshotPath(): string {
  return `crm/db-${createHash('sha256').update(`path:${secret()}`).digest('hex').slice(0, 32)}.bin`
}

function key(): Buffer {
  return createHash('sha256').update(`outreach-crm-db-v1:${secret()}`).digest()
}

export function encrypt(plain: Buffer): Buffer {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([Buffer.from('CRM1'), iv, c.getAuthTag(), body])
}

export function decrypt(data: Buffer): Buffer {
  if (data.subarray(0, 4).toString() !== 'CRM1') throw new Error('Unknown CRM snapshot format')
  const iv = data.subarray(4, 16), tag = data.subarray(16, 32)
  const d = createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  try {
    return Buffer.concat([d.update(data.subarray(32)), d.final()])
  } catch {
    throw new Error('The CRM database in Blob cannot be decrypted. If BLOB_READ_WRITE_TOKEN was rotated, set CRM_DB_SECRET to the previous token.')
  }
}

export function vercelBlobStore(): SnapshotStore {
  const access = (process.env.CRM_BLOB_ACCESS === 'private' ? 'private' : 'public') as 'public' | 'private'
  return {
    async load(etag) {
      const { get } = await import('@vercel/blob')
      const r = await get(snapshotPath(), { access, useCache: false, ifNoneMatch: etag ?? undefined })
      if (!r) return null
      if (r.statusCode === 304) return { notModified: true }
      const data = Buffer.from(await new Response(r.stream).arrayBuffer())
      return { notModified: false, data, etag: r.blob.etag }
    },
    async save(data, etag) {
      const { put, BlobPreconditionFailedError } = await import('@vercel/blob')
      try {
        const r = await put(snapshotPath(), data, {
          access, addRandomSuffix: false, contentType: 'application/octet-stream', cacheControlMaxAge: 60,
          // prima salvare: nu suprascrie un snapshot creat între timp de altă instanță
          ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
        })
        return r.etag
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError) throw new SnapshotConflict('snapshot changed')
        if (!etag) {
          // prima salvare refuzată: dacă între timp a apărut un snapshot, e un conflict normal
          const { head } = await import('@vercel/blob')
          const exists = await head(snapshotPath()).then(() => true, () => false)
          if (exists) throw new SnapshotConflict('snapshot created concurrently')
        }
        throw e
      }
    },
  }
}

const WRITE_SQL = /^\s*(insert|update|delete|create|alter|drop|truncate|with)\b/i

export class SnapshotDatabase implements Database {
  private pg: PGliteType | null = null
  private etag: string | null = null
  private dirty = false
  private lock: Promise<void> = Promise.resolve()
  private inSession = false

  constructor(private store: SnapshotStore, private migrate: (d: Database) => Promise<string[]>) {}

  private track(text: string, res: { affectedRows?: number }) {
    if (!WRITE_SQL.test(text)) return
    if (/^\s*(create|alter|drop|truncate)\b/i.test(text) || (res.affectedRows ?? 0) > 0) this.dirty = true
  }

  private wrap(run: (t: string, p?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>): Queryable {
    return {
      query: async (text, params) => {
        const r = await run(text, params)
        this.track(text, r)
        return r as { rows: any[] } // eslint-disable-line @typescript-eslint/no-explicit-any
      },
    }
  }

  async query(text: string, params?: unknown[]) {
    if (!this.pg) await this.sync()
    return this.wrap((t, p) => this.pg!.query(t, p)).query(text, params)
  }

  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    if (!this.pg) await this.sync()
    return this.pg!.transaction(tx => fn(this.wrap((t, p) => tx.query(t, p))))
  }

  private async fresh(dataDir?: Blob) {
    const { PGlite } = await import('@electric-sql/pglite')
    if (this.pg) await this.pg.close().catch(() => {})
    this.pg = new PGlite(dataDir ? { loadDataDir: dataDir } : undefined)
    await this.pg.waitReady
  }

  // Aduce instanța locală la zi cu snapshot-ul din Blob
  private async sync() {
    const r = await this.store.load(this.pg ? this.etag : null)
    if (r && r.notModified) return
    if (!r) {
      if (!this.pg || this.etag) { await this.fresh(); this.etag = null }
    } else {
      const plain = decrypt(r.data)
      await this.fresh(new Blob([new Uint8Array(plain)]))
      this.etag = r.etag
    }
    this.dirty = false
    // tabelele se creează/actualizează automat — nu e nevoie de un pas manual
    const applied = await this.migrate(this)
    if (applied.length) this.dirty = true
  }

  private async persist() {
    if (!this.dirty || !this.pg) return
    const dump = await this.pg.dumpDataDir('gzip')
    const data = encrypt(Buffer.from(await dump.arrayBuffer()))
    this.etag = await this.store.save(data, this.etag)
    this.dirty = false
  }

  private discard() {
    const pg = this.pg
    this.pg = null; this.etag = null; this.dirty = false
    pg?.close().catch(() => {})
  }

  // O cerere HTTP = o sesiune: sincronizare → handler → salvare. Cererile din aceeași
  // instanță se execută pe rând (PGlite are o singură conexiune).
  async session<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inSession) return fn() // apel imbricat
    const prev = this.lock
    let release!: () => void
    this.lock = new Promise(r => { release = r })
    await prev
    this.inSession = true
    try {
      for (let attempt = 0; ; attempt++) {
        await this.sync()
        let out: T
        try {
          out = await fn()
        } catch (e) {
          // ca pe Postgres: ce s-a scris înainte de eroare rămâne scris (ex. job marcat ca eșuat)
          try { await this.persist() } catch { this.discard() }
          throw e
        }
        try {
          await this.persist()
          return out
        } catch (e) {
          if (e instanceof SnapshotConflict && attempt < 3) { this.discard(); continue }
          this.discard()
          throw e
        }
      }
    } finally {
      this.inSession = false
      release()
    }
  }
}

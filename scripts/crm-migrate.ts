// Rulează migrațiile CRM din linia de comandă:  DATABASE_URL=... npm run crm:migrate
// (Alternativ: butonul "Run migrations" din /crm/settings.)
import { runMigrations, pendingMigrations } from '../lib/crm/db'

async function main() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(2) }
  const pending = await pendingMigrations()
  console.log(pending.length ? `Pending: ${pending.join(', ')}` : 'Database is up to date')
  const applied = await runMigrations()
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Nothing to apply')
  process.exit(0)
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })

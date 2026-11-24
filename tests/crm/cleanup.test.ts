import { describe, it, expect, beforeEach } from 'vitest'
import { freshDb } from './helpers'
import { q, one } from '@/lib/crm/db'
import { cleanupPreview, runCleanup } from '@/lib/crm/cleanup'

const add = async (name: string, stage: string, extra: Record<string, string> = {}) => {
  const cols = ['name', 'category', 'city', 'lead_source', 'website_status', 'country', 'stage', 'preview_url', ...Object.keys(extra)]
  const vals = [name, 'pension', 'Sinaia', 'google_places', 'NO_WEBSITE', 'RO', stage, `https://app.test/p/${name.toLowerCase()}-x1`, ...Object.values(extra)]
  return (await one<{ id: string }>(`INSERT INTO businesses (${cols.join(',')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, vals))!.id
}

describe('database cleanup', () => {
  beforeEach(async () => { await freshDb() })
  it('keeps contacted, interested, clients and "no WhatsApp"/"not a fit"; removes the rest and their demo files', async () => {
    await add('New', 'new_lead'); await add('Ready', 'ready_to_contact')
    await add('Contacted', 'contacted'); await add('Interested', 'interested'); await add('Won', 'won')
    await add('Nofit', 'not_a_fit'); await add('Nowa', 'new_lead', { whatsapp_status: 'NOT_FOUND', whatsapp_source: 'manual' })
    expect(await cleanupPreview()).toMatchObject({ keep: 5, remove: 2 })
    const removedFiles: string[] = []
    const r = await runCleanup({ deleteFiles: async p => { removedFiles.push(...p) } })
    expect(r.removed).toBe(2)
    expect(removedFiles).toContain('previews/new-x1.html')
    expect(removedFiles).not.toContain('previews/contacted-x1.html')
    const names = (await q<{ name: string }>('SELECT name FROM businesses ORDER BY name')).map(x => x.name)
    expect(names).toEqual(['Contacted', 'Interested', 'Nofit', 'Nowa', 'Won'])
  })
})

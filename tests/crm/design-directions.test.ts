import { describe, it, expect, beforeEach } from 'vitest'
import { DIRECTIONS, pickDirection, categoryGroup, directionPrompt } from '@/lib/crm/design-directions'
import { startDemo } from '@/lib/crm/demo'
import { freshDb } from './helpers'
import { q, one } from '@/lib/crm/db'

describe('art directions: every demo looks different', () => {
  it('maps trades to groups and every group has at least 3 styles', () => {
    expect(categoryGroup('pension')).toBe('hospitality')
    expect(categoryGroup('hairdresser')).toBe('beauty')
    expect(categoryGroup('plumber')).toBe('trades')
    expect(categoryGroup('car_repair')).toBe('auto')
    expect(categoryGroup('dentist')).toBe('services')
    for (const g of ['hospitality', 'beauty', 'food', 'trades', 'auto', 'services'] as const) expect(DIRECTIONS.filter(d => d.groups.includes(g)).length).toBeGreaterThanOrEqual(3)
    expect(new Set(DIRECTIONS.map(d => d.id)).size).toBe(DIRECTIONS.length)
  })

  it('never repeats the recent styles while fitting ones are left', () => {
    const recent: string[] = []
    for (let i = 0; i < 4; i++) {
      const d = pickDirection('pension', recent, () => 0)
      expect(recent).not.toContain(d.id)
      expect(d.groups).toContain('hospitality')
      recent.unshift(d.id)
    }
    expect(directionPrompt(DIRECTIONS[0])).toContain('DESIGN DE NIVEL GALERIE')
  })

  it('a demo gets a style in its prompt, saves it, and the next demo gets a different one', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store_secret'
    await freshDb()
    const prompts: string[] = []
    const deps = { generate: async (p: string) => { prompts.push(p); return '<!DOCTYPE html><html><head></head><body><h1>x</h1></body></html>' }, publish: async () => {}, siteContent: async () => null, screenshot: async () => {} }
    const ids: string[] = []
    for (const n of ['Pensiunea A', 'Pensiunea B', 'Pensiunea C']) {
      const b = await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source, website_status, country) VALUES ($1, 'pension', 'Bran', 'google_places', 'NO_WEBSITE', 'RO') RETURNING id`, [n])
      const r = await startDemo(b!.id, { origin: 'https://app.test' }, deps)
      await r.job
      await q(`UPDATE businesses SET demo_at = now() + ($2 || ' seconds')::interval WHERE id = $1`, [b!.id, String(ids.length)])
      ids.push(b!.id)
    }
    const styles = (await q<{ demo_style: string }>(`SELECT demo_style FROM businesses ORDER BY demo_at`)).map(r => r.demo_style)
    expect(new Set(styles).size).toBe(3)
    expect(prompts[0]).toContain('DIRECȚIA ARTISTICĂ')
    expect(prompts[0]).toContain('data-cms-form') // formularul funcțional e cerut la fiecare demo
    // stil ales manual
    const r = await startDemo(ids[0], { origin: 'https://app.test', style: 'swiss-grid' }, deps)
    await r.job
    expect((await one<{ demo_style: string }>('SELECT demo_style FROM businesses WHERE id = $1', [ids[0]]))!.demo_style).toBe('swiss-grid')
    expect(prompts.at(-1)).toContain('Grilă elvețiană')
  })
})

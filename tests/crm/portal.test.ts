import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { freshDb } from './helpers'
import { q, one } from '@/lib/crm/db'
import { createPortal, verifyPortal, saveContent, startMarkup, sanitizeContent, extractInitial, injectCmsScript, hasCmsMarkers } from '@/lib/crm/portal'
import { startEdit } from '@/lib/crm/demo'
import { withConceptBanner } from '@/lib/preview'

const SITE = `<!DOCTYPE html><html><head><title>Hanul</title></head><body>
<header><a data-cms-tel href="tel:0723000000"><span data-cms-text="phone">0723 000 000</span></a></header>
<section data-cms-section="prices"><h2>Tarife</h2><ul data-cms="prices">
  <li data-cms-item><b data-cms-field="name">Cameră dublă</b> <i data-cms-field="price">250 lei</i> <small data-cms-field="note">mic dejun inclus</small></li>
</ul></section>
<section data-cms-section="offers" style="display:none"><div data-cms="offers"><article data-cms-item><h3 data-cms-field="title"></h3><p data-cms-field="text"></p><em data-cms-field="period"></em></article></div></section>
<section data-cms-section="gallery"><div data-cms="gallery"><figure data-cms-item><img data-cms-field="src" src="https://img.test/old.jpg"></figure></div></section>
<p data-cms-text="hours">L–D 8–22</p>
<form data-cms-form><input name="name"><input name="phone"><input name="email"><textarea name="message"></textarea><button type="submit">Trimite</button><p data-cms-form-success hidden>Mulțumim!</p></form>
</body></html>`

async function biz() {
  await freshDb()
  return (await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source, website_status, country, preview_url, stage) VALUES ('Hanul Izvorul Rece', 'pension', 'Sinaia', 'google_places', 'NO_WEBSITE', 'RO', 'https://app.test/p/hanul-abc123', 'won') RETURNING id`))!.id
}

describe('client panel: link + PIN', () => {
  beforeEach(() => { process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store_secret' })

  it('wrong PIN is refused, 5 wrong PINs lock it, a new PIN keeps the same link', async () => {
    const id = await biz()
    const a = await createPortal(id)
    expect(a.pin).toMatch(/^\d{6}$/)
    const wrong = a.pin === '111111' ? '222222' : '111111'
    await expect(verifyPortal(a.token, wrong)).rejects.toMatchObject({ status: 401 })
    expect((await verifyPortal(a.token, a.pin)).name).toBe('Hanul Izvorul Rece')
    for (let i = 0; i < 4; i++) await expect(verifyPortal(a.token, wrong)).rejects.toMatchObject({ status: 401 })
    await expect(verifyPortal(a.token, wrong)).rejects.toMatchObject({ status: 429 })
    await expect(verifyPortal(a.token, a.pin)).rejects.toMatchObject({ status: 429 }) // blocat 15 minute
    const b = await createPortal(id) // cod nou (deblochează), același link
    expect(b.token).toBe(a.token)
    await expect(verifyPortal(a.token, a.pin === b.pin ? wrong : a.pin)).rejects.toBeTruthy()
    expect((await verifyPortal(b.token, b.pin)).business_id).toBe(id)
    await expect(verifyPortal('nope', b.pin)).rejects.toMatchObject({ status: 404 })
    const row = await one<{ pin_hash: string }>('SELECT pin_hash FROM client_portals WHERE business_id = $1', [id])
    expect(row!.pin_hash).not.toContain(b.pin) // PIN-ul nu e salvat în clar
  })

  it('saving cleans the data and publishes it for the site', async () => {
    const id = await biz()
    await createPortal(id)
    const put: Record<string, string> = {}
    const c = await saveContent(id, {
      contact: { phone: '0723 111 222', email: 'a@b.ro', address: 'Avram Iancu 47', hours: 'Zilnic' },
      prices: [{ name: 'Cameră', price: '300 lei', note: '' }, { name: '', price: '' }],
      offers: [{ title: 'Revelion', text: '3 nopți', from: '2026-12-29', to: 'nu e dată', active: true }],
      gallery: [{ src: 'https://x.public.blob.vercel-storage.com/a.jpg', alt: '' }, { src: 'javascript:alert(1)', alt: '' }],
    }, { put: async (p, b) => { put[p] = b } })
    expect(c.prices).toHaveLength(1)
    expect(c.offers[0]).toMatchObject({ from: '2026-12-29', to: '' })
    expect(c.gallery).toHaveLength(1)
    expect(JSON.parse(put['site-data/hanul-abc123.json']).contact.phone).toBe('0723 111 222')
  })
})

describe('making the site editable', () => {
  beforeEach(() => { process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store_secret' })

  it('Claude adds the markers; the current values become the panel content; the JSON block is removed from the page', async () => {
    const id = await biz()
    await createPortal(id)
    const stored: Record<string, string> = { 'hanul-abc123': withConceptBanner('<!DOCTYPE html><html><head></head><body><h1>Hanul</h1><p>Tel 0723 000 000</p></body></html>', 'Hanul', 'Grig', 'ro') }
    const put: Record<string, string> = {}
    let prompt = ''
    const initial = { contact: { phone: '0723 000 000', email: '', address: '', hours: '' }, prices: [{ name: 'Cameră dublă', price: '250 lei', note: '' }], offers: [], gallery: [] }
    const r = await startMarkup(id, { designer: 'Grig' }, {
      load: async s => stored[s],
      generate: async p => { prompt = p; return SITE.replace('</body>', `<script type="application/json" id="cms-initial">${JSON.stringify(initial)}</script></body>`) },
      publish: async (s, h) => { stored[s] = h },
      put: async (p, b) => { put[p] = b },
      screenshot: async () => {},
    })
    expect(await r.job).toBe(true)
    expect(prompt).toContain('data-cms="prices"')
    expect(prompt).not.toContain('concept-banner')
    expect(stored['hanul-abc123']).not.toContain('cms-initial')
    expect(hasCmsMarkers(stored['hanul-abc123'])).toBe(true)
    const p = await one<{ content: { prices: unknown[] } }>('SELECT content FROM client_portals WHERE business_id = $1', [id])
    expect(p!.content.prices).toEqual([{ name: 'Cameră dublă', price: '250 lei', note: '' }])
    expect(JSON.parse(put['site-data/hanul-abc123.json']).prices).toHaveLength(1)
  })

  it('a later edit by Claude gets the client data and updates it (no stale prices on the site)', async () => {
    const id = await biz()
    await createPortal(id)
    await saveContent(id, { contact: { phone: '0723 111 222' }, prices: [{ name: 'Cameră', price: '300 lei' }] }, { put: async () => {} })
    const stored: Record<string, string> = { 'hanul-abc123': SITE }
    const put: Record<string, string> = {}
    let prompt = ''
    const r = await startEdit(id, { instructions: 'adaugă tariful Cabană 500 lei' }, {
      load: async s => stored[s],
      generate: async p => { prompt = p; return SITE.replace('</body>', `<script type="application/json" id="cms-initial">${JSON.stringify({ contact: { phone: '0723 111 222' }, prices: [{ name: 'Cameră', price: '300 lei' }, { name: 'Cabană', price: '500 lei' }] })}</script></body>`) },
      publish: async (s, h) => { stored[s] = h },
      put: async (p, b) => { put[p] = b },
      screenshot: async () => {},
    })
    expect(await r.job).toBe(true)
    expect(prompt).toContain('"price":"300 lei"')
    expect(prompt).toContain('Păstrează-le pe toate')
    expect(JSON.parse(put['site-data/hanul-abc123.json']).prices).toHaveLength(2)
    expect(stored['hanul-abc123']).not.toContain('cms-initial')
  })

  it('helpers', () => {
    expect(extractInitial('<body>x<script type="application/json" id="cms-initial">{"prices":[{"name":"A","price":"1"}]}</script></body>').content!.prices).toHaveLength(1)
    expect(sanitizeContent(null).prices).toEqual([])
    expect(injectCmsScript('<body><p>no markers</p></body>', 'https://app.test', 's')).not.toContain('cms.js')
    const inj = injectCmsScript(SITE, 'https://app.test', 'hanul-abc123')
    expect(inj).toContain('<script src="https://app.test/cms.js" data-src="https://app.test/api/site/hanul-abc123" defer></script>')
    expect(injectCmsScript(inj, 'https://app.test', 'hanul-abc123').match(/cms\.js/g)).toHaveLength(1)
  })
})

describe('cms.js on the site (real browser)', () => {
  it('fills prices, offers (only current ones), gallery and contact; hides empty sections', async () => {
    const puppeteer = (await import('puppeteer-core')).default
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'], headless: true })
    try {
      const page = await browser.newPage()
      const today = new Date().toISOString().slice(0, 10)
      const data = {
        updated_at: 'x',
        contact: { phone: '0723 111 222', email: 'rezervari@hanul.ro', address: '', hours: 'Zilnic 9–21' },
        prices: [{ name: 'Cameră', price: '300 lei', note: '' }, { name: 'Cabană', price: '500 lei', note: '4 persoane' }],
        offers: [{ title: 'Ofertă activă', text: 'azi', from: '', to: today, active: true }, { title: 'Expirată', text: '', from: '', to: '2020-01-01', active: true }, { title: 'Oprită', text: '', from: '', to: '', active: false }],
        gallery: [{ src: 'https://img.test/1.jpg', alt: 'a' }, { src: 'https://img.test/2.jpg', alt: 'b' }],
      }
      let posted: Record<string, string> = {}
      await page.setRequestInterception(true)
      page.on('request', req => {
        const u = req.url()
        if (u === 'https://site.test/') return req.respond({ contentType: 'text/html', body: injectCmsScript(SITE, 'https://app.test', 'hanul-abc123') })
        if (u.endsWith('/cms.js')) return req.respond({ contentType: 'text/javascript', body: readFileSync('public/cms.js', 'utf8') })
        if (u.endsWith('/contact')) { if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type', 'access-control-allow-methods': 'POST' } }); posted = JSON.parse(req.postData() || '{}'); return req.respond({ contentType: 'application/json', body: '{"ok":true}', headers: { 'access-control-allow-origin': '*' } }) }
        if (u.startsWith('https://app.test/api/site/')) return req.respond({ contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } })
        return req.respond({ status: 404, body: '' })
      })
      await page.goto('https://site.test/')
      await page.waitForFunction(() => document.querySelectorAll('[data-cms="prices"] [data-cms-item]').length === 2)
      const r = await page.evaluate(() => ({
        prices: Array.from(document.querySelectorAll('[data-cms="prices"] [data-cms-item]')).map(n => (n as HTMLElement).innerText.replace(/\s+/g, ' ').trim()),
        offers: Array.from(document.querySelectorAll('[data-cms="offers"] [data-cms-item] h3')).map(n => n.textContent),
        offersVisible: (document.querySelector('[data-cms-section="offers"]') as HTMLElement).style.display,
        gallery: Array.from(document.querySelectorAll('[data-cms="gallery"] img')).map(i => (i as HTMLImageElement).src),
        phone: document.querySelector('[data-cms-text="phone"]')!.textContent,
        tel: document.querySelector('[data-cms-tel]')!.getAttribute('href'),
        hours: document.querySelector('[data-cms-text="hours"]')!.textContent,
        noteHidden: (document.querySelector('[data-cms="prices"] [data-cms-item] small') as HTMLElement).style.display,
      }))
      expect(r.prices).toEqual(['Cameră 300 lei', 'Cabană 500 lei 4 persoane'])
      expect(r.offers).toEqual(['Ofertă activă'])
      expect(r.offersVisible).toBe('')
      expect(r.gallery).toEqual(['https://img.test/1.jpg', 'https://img.test/2.jpg'])
      expect(r.phone).toBe('0723 111 222')
      expect(r.tel).toBe('tel:0723111222')
      expect(r.hours).toBe('Zilnic 9–21')
      expect(r.noteHidden).toBe('none')
      await page.type('form[data-cms-form] [name=name]', 'Ana')
      await page.type('form[data-cms-form] [name=message]', 'Aveți loc?')
      await page.click('form[data-cms-form] [type=submit]')
      await page.waitForFunction(() => !(document.querySelector('[data-cms-form-success]') as HTMLElement).hidden)
      expect(posted).toMatchObject({ name: 'Ana', message: 'Aveți loc?', website: '' })
    } finally { await browser.close() }
  }, 60_000)
})

describe('contact form messages', () => {
  beforeEach(() => { process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store_secret' })

  it('saves the message, emails the address from the client panel with Reply-To = visitor, blocks bots and floods', async () => {
    const { receiveSiteMessage, listSiteMessages } = await import('@/lib/crm/site-messages')
    const id = await biz()
    await createPortal(id)
    await q(`UPDATE businesses SET email = 'rezervari@hanul.ro' WHERE id = $1`, [id]) // emailul pus de designer în CRM
    const sent: { to: string; replyTo?: string; subject: string; text: string }[] = []
    const send = async (m: typeof sent[0]) => { sent.push(m) }
    expect(await receiveSiteMessage('hanul-abc123', { name: 'Ana', email: 'ana@x.ro', phone: '0722', message: 'Aveți loc de Revelion?', checkin: '2026-12-30' }, '1.2.3.4', send)).toEqual({ ok: true, emailed: true })
    expect(sent[0]).toMatchObject({ to: 'rezervari@hanul.ro', replyTo: 'ana@x.ro' })
    expect(sent[0].subject).toContain('Hanul Izvorul Rece')
    expect(sent[0].text).toContain('Sosire: 2026-12-30')
    expect(await receiveSiteMessage('hanul-abc123', { message: 'spam', website: 'http://spam' }, '1.2.3.4', send)).toMatchObject({ spam: true })
    for (let i = 0; i < 4; i++) await receiveSiteMessage('hanul-abc123', { message: `m${i}` }, '1.2.3.4', send)
    await expect(receiveSiteMessage('hanul-abc123', { message: 'prea multe' }, '1.2.3.4', send)).rejects.toMatchObject({ status: 429 })
    await expect(receiveSiteMessage('hanul-abc123', { message: '' }, '5.6.7.8', send)).rejects.toMatchObject({ status: 400 })
    await expect(receiveSiteMessage('nu-exista', { message: 'x' }, '5.6.7.8', send)).rejects.toMatchObject({ status: 404 })
    const list = await listSiteMessages(id)
    expect(list).toHaveLength(5)
    expect(list[4]).toMatchObject({ name: 'Ana', emailed: true })
  })

  it('keeps the message (for the panel) even when email fails or there is no address', async () => {
    const { receiveSiteMessage, listSiteMessages } = await import('@/lib/crm/site-messages')
    const id = await biz()
    expect(await receiveSiteMessage('hanul-abc123', { message: 'Bună' }, '9.9.9.9', async () => { throw new Error('down') })).toEqual({ ok: true, emailed: false })
    const row = await one<{ email_error: string }>('SELECT email_error FROM site_messages WHERE business_id = $1', [id])
    expect(row!.email_error).toBe('no recipient email')
    expect(await listSiteMessages(id)).toHaveLength(1)
  })
})

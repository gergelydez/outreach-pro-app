import { describe, it, expect } from 'vitest'
import { withSiteFixes } from '@/lib/site-fixes'

const PAGE = `<!DOCTYPE html><html><head><style>.reveal{opacity:0;transform:translateY(30px)}.reveal.in{opacity:1;transform:none}header{position:sticky;top:0;height:60px}</style></head><body>
<header><b>Hanul</b></header>
<main><section><h2 id="a" class="reveal">Despre noi</h2><p id="b" class="reveal">Text care rămânea invizibil</p></section></main>
<script>var seen = localStorage.getItem('visited'); document.getElementById('a').classList.add('in')</script>
</body></html>`

describe('automatic display fixes for generated sites (real browser)', () => {
  it('scripts that use localStorage keep working in the sandboxed demo, stuck-invisible content is shown, the fixed header stays on top', async () => {
    const puppeteer = (await import('puppeteer-core')).default
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'], headless: true })
    try {
      const run = async (html: string) => {
        const page = await browser.newPage()
        await page.setRequestInterception(true)
        page.on('request', r => r.respond({ contentType: 'text/html', body: html, headers: { 'Content-Security-Policy': 'sandbox allow-scripts' } }))
        await page.goto('https://demo.test/p/x')
        await new Promise(res => setTimeout(res, 2200))
        const out = await page.evaluate(() => ({
          a: getComputedStyle(document.getElementById('a')!).opacity,
          b: getComputedStyle(document.getElementById('b')!).opacity,
          z: getComputedStyle(document.querySelector('header')!).zIndex,
        }))
        await page.close()
        return out
      }
      const before = await run(PAGE)
      expect(before.a).toBe('0') // fără reparație: scriptul se oprește la localStorage, conținutul rămâne invizibil
      const after = await run(withSiteFixes(PAGE))
      expect(after.a).toBe('1') // scriptul site-ului a mers mai departe
      expect(after.b).toBe('1') // conținutul rămas invizibil a fost afișat
      expect(after.z).toBe('2147483000')
      expect(withSiteFixes(withSiteFixes(PAGE)).match(/data-site-fix/g)).toHaveLength(2) // nu se adaugă de două ori
    } finally { await browser.close() }
  }, 60_000)
})

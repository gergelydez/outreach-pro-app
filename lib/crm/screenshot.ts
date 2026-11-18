// Poza (screenshot) cu prima parte a demo-ului, în format de telefon, ca s-o trimiți pe WhatsApp.
// Pe Vercel rulează Chromium-ul din @sparticuz/chromium; local, Chromium-ul instalat (CHROME_PATH).
import { stripConceptBanner } from '@/lib/preview'

export async function screenshotHtml(html: string): Promise<Buffer> {
  const puppeteer = (await import('puppeteer-core')).default
  let executablePath: string
  let args: string[]
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default
    executablePath = await chromium.executablePath()
    args = chromium.args
  } else {
    executablePath = process.env.CHROME_PATH || '/opt/pw-browsers/chromium'
    args = ['--no-sandbox', '--disable-dev-shm-usage']
  }
  const browser = await puppeteer.launch({ executablePath, args, headless: true })
  try {
    const page = await browser.newPage()
    // iPhone obișnuit: 390×844, ecran retina
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await page.setContent(stripConceptBanner(html), { waitUntil: 'networkidle2', timeout: 25_000 }).catch(() => { /* pozele lente: facem poza cu ce s-a încărcat */ })
    // animațiile de intrare (fade-in la scroll) ar lăsa secțiuni goale în poză
    await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}[data-aos],.reveal,.fade-in,.animate{opacity:1!important;transform:none!important}' }).catch(() => {})
    await new Promise(r => setTimeout(r, 1200))
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 390, height: 844 } })
    return Buffer.from(png)
  } finally {
    await browser.close().catch(() => {})
  }
}

export async function publishScreenshot(slug: string, html: string, deps: { shot?: (html: string) => Promise<Buffer>; put?: (path: string, data: Buffer) => Promise<void> } = {}) {
  const png = await (deps.shot || screenshotHtml)(html)
  if (deps.put) return deps.put(`previews/${slug}.png`, png)
  const { put } = await import('@vercel/blob')
  await put(`previews/${slug}.png`, png, { access: 'public', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 })
}

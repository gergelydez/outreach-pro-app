import { NextRequest, NextResponse } from 'next/server'
import { putFile, r2Configured } from '@/lib/object-store'
import { randomBytes } from 'crypto'
import { slugify, withConceptBanner } from '@/lib/preview'

export const maxDuration = 30

// Publică demo-ul în Vercel Blob și întoarce un link /p/<slug> pe domeniul aplicației.
// Necesită un Blob store conectat (Vercel → Storage → Blob → Connect to project): fie
// BLOB_READ_WRITE_TOKEN, fie BLOB_STORE_ID (autentificare OIDC, automată pe Vercel).

export async function POST(req: NextRequest) {
  const { html, businessName, designer = '', existingUrl = '', lang = 'ro' } = await req.json()
  if (!html || !businessName) return NextResponse.json({ error: 'Lipsă html / businessName' }, { status: 400 })

  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID && !r2Configured()) {
    return NextResponse.json({
      error: 'Hostingul de preview nu e configurat',
      code: 'no_blob',
    }, { status: 501 })
  }

  // La regenerare păstrăm același link — e posibil să-l fi trimis deja
  const prevSlug = String(existingUrl).match(/\/p\/([a-z0-9-]+)$/)?.[1]
  const slug = prevSlug || `${slugify(businessName)}-${randomBytes(3).toString('hex')}`

  try {
    await putFile(`previews/${slug}.html`, withConceptBanner(html, businessName, designer, lang === 'en' ? 'en' : lang === 'hu' ? 'hu' : 'ro'), { contentType: 'text/html; charset=utf-8' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }

  return NextResponse.json({ url: `${req.nextUrl.origin}/p/${slug}`, slug })
}

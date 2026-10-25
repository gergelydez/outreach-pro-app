import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { randomBytes } from 'crypto'
import { slugify, withConceptBanner } from '@/lib/preview'

export const maxDuration = 30

// Publică demo-ul în Vercel Blob și întoarce un link /p/<slug> pe domeniul aplicației.
// Necesită BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob → Connect to project).

export async function POST(req: NextRequest) {
  const { html, businessName, designer = '', existingUrl = '' } = await req.json()
  if (!html || !businessName) return NextResponse.json({ error: 'Lipsă html / businessName' }, { status: 400 })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({
      error: 'Hostingul de preview nu e configurat',
      code: 'no_blob',
    }, { status: 501 })
  }

  // La regenerare păstrăm același link — e posibil să-l fi trimis deja
  const prevSlug = String(existingUrl).match(/\/p\/([a-z0-9-]+)$/)?.[1]
  const slug = prevSlug || `${slugify(businessName)}-${randomBytes(3).toString('hex')}`

  try {
    await put(`previews/${slug}.html`, withConceptBanner(html, businessName, designer), {
      access: 'public',
      contentType: 'text/html; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }

  return NextResponse.json({ url: `${req.nextUrl.origin}/p/${slug}`, slug })
}

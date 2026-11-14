import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/crm/session'

// Protejează doar modulul CRM (/crm, /api/crm). Restul aplicației rămâne neschimbat.
// - pagini: fără sesiune → /crm/login
// - API: fără sesiune → 401; cereri care modifică date trebuie să vină de pe același domeniu (anti-CSRF)
// - /api/crm/worker/* și /api/crm/maintenance/* folosesc tokenuri proprii, verificate în rută

const PUBLIC_API = ['/api/crm/auth/login', '/api/crm/auth/logout']
const TOKEN_API = ['/api/crm/worker/', '/api/crm/maintenance/']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith('/api/crm')

  if (isApi && TOKEN_API.some(p => pathname.startsWith(p))) return NextResponse.next()

  if (isApi && req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin')
    if (!origin || new URL(origin).host !== req.headers.get('host')) {
      return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 })
    }
  }

  if (pathname === '/crm/login' || PUBLIC_API.includes(pathname)) return NextResponse.next()

  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (ok) return NextResponse.next()
  if (isApi) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const url = req.nextUrl.clone()
  url.pathname = '/crm/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = { matcher: ['/crm/:path*', '/api/crm/:path*'] }

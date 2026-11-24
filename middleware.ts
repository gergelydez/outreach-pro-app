import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/crm/session'
import { isAppHost } from '@/lib/live-host'

// Modulul CRM (/crm, /api/crm). Restul aplicației rămâne neschimbat.
// - parola e OPȚIONALĂ: fără CRM_PASSWORD, CRM-ul e deschis, ca restul aplicației
// - cu CRM_PASSWORD setat: pagini fără sesiune → /crm/login
// - API: fără sesiune → 401; cereri care modifică date trebuie să vină de pe același domeniu (anti-CSRF)
// - /api/crm/worker/* și /api/crm/maintenance/* folosesc tokenuri proprii, verificate în rută

const PUBLIC_API = ['/api/crm/auth/login', '/api/crm/auth/logout']
const TOKEN_API = ['/api/crm/worker/', '/api/crm/maintenance/', '/api/crm/hunt/cron']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  // domeniul unui client (ex. hanulizvorulrece.ro): servim site-ul lui, mereu la zi
  const reqHost = req.headers.get('host') || ''
  if (!isAppHost(reqHost)) {
    if (pathname === '/cms.js' || pathname.startsWith('/media/')) return NextResponse.next()
    const url = req.nextUrl.clone()
    url.pathname = '/api/live-site'
    url.search = `?host=${encodeURIComponent(reqHost.replace(/:\d+$/, ''))}&path=${encodeURIComponent(pathname)}`
    return NextResponse.rewrite(url)
  }
  // pe domeniul public pentru clienți (PUBLIC_APP_URL), pagina principală e aplicația lor
  if (pathname === '/') {
    let host = ''
    try { host = process.env.PUBLIC_APP_URL ? new URL(process.env.PUBLIC_APP_URL).host : '' } catch { /* */ }
    if (host && req.headers.get('host') === host) return NextResponse.redirect(new URL('/client', req.url))
    return NextResponse.next()
  }
  if (!pathname.startsWith('/crm') && !pathname.startsWith('/api/crm')) return NextResponse.next()
  const isApi = pathname.startsWith('/api/crm')

  if (isApi && TOKEN_API.some(p => pathname.startsWith(p))) return NextResponse.next()

  if (isApi && req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin')
    if (!origin || new URL(origin).host !== req.headers.get('host')) {
      return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 })
    }
  }

  if (!process.env.CRM_PASSWORD) {
    if (pathname === '/crm/login') return NextResponse.redirect(new URL('/crm', req.url))
    return NextResponse.next()
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

// toate paginile (pentru domeniile clienților); /api/* doar pentru CRM, ca /api/site și formularul să meargă și pe domeniul clientului
export const config = { matcher: ['/((?!api/|_next/static|_next/image).*)', '/api/crm/:path*'] }

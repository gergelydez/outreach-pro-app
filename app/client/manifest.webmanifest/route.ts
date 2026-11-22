// Manifestul aplicației clientului (instalabilă pe telefon), separat de aplicația designerului
export const dynamic = 'force-static'

export function GET() {
  return new Response(JSON.stringify({
    name: 'Panoul site-ului',
    short_name: 'Panoul meu',
    description: 'Mesajele de pe site, tarife, oferte și poze',
    id: '/client',
    start_url: '/client',
    scope: '/client',
    display: 'standalone',
    background_color: '#f4f5f7',
    theme_color: '#0f172a',
    prefer_related_applications: false,
    orientation: 'portrait',
    icons: [
      { src: '/icons/client-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/client-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/client-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } })
}

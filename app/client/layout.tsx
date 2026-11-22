import type { Metadata, Viewport } from 'next'

// Aplicația clientului: manifest și iconiță proprii, ca să se instaleze separat de aplicația designerului
export const metadata: Metadata = {
  title: 'Panoul meu',
  description: 'Mesajele de pe site, tarife, oferte și poze',
  manifest: '/client/manifest.webmanifest',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Panoul meu', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/client-192.png', apple: '/icons/client-180.png' },
}

export const viewport: Viewport = { themeColor: '#0f172a', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return children
}

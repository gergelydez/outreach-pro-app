import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Activează panoul site-ului',
  robots: { index: false, follow: false },
  manifest: '/client/manifest.webmanifest',
  icons: { icon: '/icons/client-192.png', apple: '/icons/client-180.png' },
}
export const viewport: Viewport = { themeColor: '#0f172a', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Administrare site', robots: { index: false, follow: false }, manifest: null }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}

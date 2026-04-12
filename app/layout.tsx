import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Outreach Pro – Găsește clienți fără site',
  description: 'Găsește afaceri fără website și trimite oferte personalizate pe WhatsApp sau Email',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  )
}

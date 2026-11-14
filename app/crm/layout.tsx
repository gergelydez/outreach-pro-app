import type { Metadata } from 'next'
import Shell from '@/components/crm/Shell'

export const metadata: Metadata = { title: 'Business Hunter CRM', robots: { index: false, follow: false } }

export const dynamic = 'force-dynamic'

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  // butonul „Sign out” apare doar dacă e setată o parolă (opțională)
  return <Shell passwordProtected={!!process.env.CRM_PASSWORD}>{children}</Shell>
}

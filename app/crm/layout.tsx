import type { Metadata } from 'next'
import Shell from '@/components/crm/Shell'

export const metadata: Metadata = { title: 'Business Hunter CRM', robots: { index: false, follow: false } }

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>
}

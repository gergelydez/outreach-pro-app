'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { Search, LayoutDashboard, Radar, Users, SquareKanban, Send, Globe, Sparkles, CalendarClock, BarChart3, Settings, LogOut, Menu, X } from 'lucide-react'
import { cx } from './ui'
import { api } from '@/lib/crm/client'

const NAV = [
  { href: '/crm/gaseste', label: 'Găsește clienți UK 🇬🇧', icon: Search },
  { href: '/crm/ungaria', label: 'Găsește clienți Ungaria 🇭🇺', icon: Search },
  { href: '/crm', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/crm/hunter', label: 'Business Hunter AI', icon: Radar },
  { href: '/crm/leads', label: 'All Leads', icon: Users },
  { href: '/crm/pipeline', label: 'Sales Pipeline', icon: SquareKanban },
  { href: '/crm/outreach', label: 'Outreach & Messages', icon: Send },
  { href: '/crm/audits', label: 'Website Audits', icon: Globe },
  { href: '/crm/assistant', label: 'AI Sales Assistant', icon: Sparkles },
  { href: '/crm/followups', label: 'Follow-ups', icon: CalendarClock },
  { href: '/crm/reports', label: 'Reports & Analytics', icon: BarChart3 },
  { href: '/crm/settings', label: 'Settings & API', icon: Settings },
]

export default function Shell({ children, passwordProtected = false }: { children: ReactNode; passwordProtected?: boolean }) {
  const path = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  if (path === '/crm/login' || path.endsWith('/print')) return <>{children}</>

  const isActive = (href: string) => (href === '/crm' ? path === '/crm' : path.startsWith(href))
  const logout = async () => { await api('/api/crm/auth/logout', { method: 'POST', json: {} }).catch(() => {}); router.push('/crm/login') }

  const nav = (
    <nav className="flex flex-col h-full">
      <div className="px-4 h-14 flex items-center gap-2.5 border-b border-white/5">
        <div className="w-7 h-7 rounded-md bg-teal-500/90 flex items-center justify-center text-[13px] font-bold text-slate-950">UK</div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-white">Business Hunter</div>
          <div className="text-[10px] text-slate-400">Sales CRM</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setOpen(false)}
            className={cx('flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors',
              isActive(href) ? 'bg-white/10 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/5')}>
            <Icon className={cx('w-4 h-4', isActive(href) ? 'text-teal-400' : '')} />
            {label}
          </Link>
        ))}
      </div>
      <div className="p-2 border-t border-white/5 space-y-0.5">
        <Link href="/" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] text-slate-500 hover:text-slate-300">← Outreach Pro (RO)</Link>
        {passwordProtected && (
          <button onClick={logout} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-slate-400 hover:text-white hover:bg-white/5">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
        )}
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 [font-family:'Plus_Jakarta_Sans',system-ui,sans-serif]" style={{ colorScheme: 'light' }}>
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-60 bg-[#0b1220] z-30">{nav}</aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-[#0b1220]">{nav}</aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="lg:hidden sticky top-0 z-20 h-12 bg-[#0b1220] flex items-center justify-between px-3">
          <button onClick={() => setOpen(true)} className="text-slate-300 p-1.5" aria-label="Open menu"><Menu className="w-5 h-5" /></button>
          <span className="text-sm font-semibold text-white">{NAV.find(n => isActive(n.href))?.label || 'CRM'}</span>
          <span className="w-8">{open && <X className="w-5 h-5 text-slate-300" />}</span>
        </header>
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">{children}</main>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Mail, LayoutDashboard, Rocket, Users, Settings } from 'lucide-react'

const links = [
  { href: '/',          label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/campaign',  label: 'Campanie',   icon: Rocket },
  { href: '/leads',     label: 'Leads',      icon: Users },
  { href: '/settings',  label: 'Setări',     icon: Settings },
]

export default function Navbar() {
  const path = usePathname()

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between
                    px-6 h-14 bg-slate-900 border-b border-slate-700 shadow-md">
      {/* Brand */}
      <Link href="/" className="flex items-center gap-2 font-bold text-white">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-500">
          <Mail className="w-4 h-4 text-white" />
        </span>
        <span className="hidden sm:block text-sm">BizOutreach</span>
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = path === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
                          transition-colors
                          ${active
                            ? 'bg-green-500/20 text-green-400'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden md:block">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

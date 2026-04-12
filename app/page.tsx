'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getLeads, getTodayStats, getAllStats } from '@/lib/storage'

export default function Home() {
  const [leads, setLeads] = useState(0)
  const [sent, setSent] = useState(0)
  const [ready, setReady] = useState(0)

  useEffect(() => {
    const all = getLeads()
    setLeads(all.length)
    setReady(all.filter(l => l.status === 'ready').length)
    const stats = getAllStats()
    setSent(stats.reduce((s, d) => s + d.sent, 0))
  }, [])

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b2a 50%, #0a1628 100%)' }}>
      {/* Header */}
      <header className="border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}>
              🎯
            </div>
            <span className="font-bold text-lg text-white">Outreach Pro</span>
          </div>
          <nav className="flex gap-2">
            <Link href="/leads" className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all text-sm font-medium">
              Leads
            </Link>
            <Link href="/settings" className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all text-sm font-medium">
              Setări
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6 border"
               style={{ background: 'rgba(37,211,102,0.1)', borderColor: 'rgba(37,211,102,0.3)', color: '#25D366' }}>
            ● LIVE – Romania, {new Date().getFullYear()}
          </div>
          <h1 className="text-5xl font-extrabold text-white mb-4 leading-tight">
            Găsește afaceri fără site.<br />
            <span style={{ color: '#25D366' }}>Câștigă clienți azi.</span>
          </h1>
          <p className="text-slate-400 text-xl max-w-2xl mx-auto mb-10">
            Caută automat pe Google Maps afacerile fără website, generează mesaje personalizate și trimite oferte pe <strong className="text-white">WhatsApp</strong> sau Email.
          </p>
          <Link href="/leads"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-white font-bold text-lg transition-all hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', boxShadow: '0 0 30px rgba(37,211,102,0.3)' }}>
            <span>🚀</span> Începe campania
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-16">
          {[
            { label: 'Leads găsite', value: leads, icon: '🎯', color: '#63b3ed' },
            { label: 'Gata de trimis', value: ready, icon: '⚡', color: '#f6ad55' },
            { label: 'Mesaje trimise', value: sent, icon: '✅', color: '#25D366' },
          ].map(s => (
            <div key={s.label} className="glass rounded-2xl p-6 text-center">
              <div className="text-3xl mb-2">{s.icon}</div>
              <div className="text-4xl font-extrabold mb-1" style={{ color: s.color }}>{s.value}</div>
              <div className="text-sm text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="glass rounded-3xl p-8">
          <h2 className="text-xl font-bold text-white mb-8 text-center">Cum funcționează</h2>
          <div className="grid grid-cols-4 gap-6">
            {[
              { step: '1', icon: '🔍', title: 'Caută leads', desc: 'Selectezi orașul și categoria. Google Places găsește toate afacerile fără site.' },
              { step: '2', icon: '🤖', title: 'AI generează', desc: 'Claude AI scrie un mesaj WhatsApp și un email personalizat pentru fiecare afacere.' },
              { step: '3', icon: '📱', title: 'Trimite pe WA', desc: 'Click pe butonul WhatsApp, mesajul e copiat automat. Trimiți în 5 secunde.' },
              { step: '4', icon: '💰', title: 'Încasezi', desc: 'Clienții sună, tu faci site-ul, încasezi 500-1500 RON per proiect.' },
            ].map(s => (
              <div key={s.step} className="text-center">
                <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center text-2xl"
                     style={{ background: 'rgba(99,179,237,0.1)', border: '1px solid rgba(99,179,237,0.2)' }}>
                  {s.icon}
                </div>
                <div className="font-bold text-white mb-1">{s.title}</div>
                <div className="text-xs text-slate-400 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

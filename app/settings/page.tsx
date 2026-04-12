'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '@/lib/storage'
import type { Settings } from '@/lib/types'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setSettings(getSettings()) }, [])

  function update(key: keyof Settings, value: string | number) {
    setSettings(s => ({ ...s, [key]: value }))
  }

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const fields: { key: keyof Settings; label: string; placeholder: string; type?: string; hint?: string; secret?: boolean }[] = [
    { key: 'googlePlacesApiKey', label: '🗺️ Google Places API Key', placeholder: 'AIza...', secret: true, hint: 'Obține de pe console.cloud.google.com → APIs → Places API' },
    { key: 'anthropicApiKey',    label: '🤖 Anthropic API Key',     placeholder: 'sk-ant-...', secret: true, hint: 'Obține de pe console.anthropic.com' },
    { key: 'senderName',    label: '👤 Numele tău', placeholder: 'Alexandru Ionescu', hint: 'Apare în semnătura mesajelor' },
    { key: 'yourWebsite',   label: '🌐 Site-ul tău', placeholder: 'https://websitultau.ro', hint: 'Apare în emailuri și WhatsApp' },
    { key: 'yourPortfolio', label: '📸 Portofoliu', placeholder: 'https://portofoliu.websitultau.ro', hint: 'Link portofoliu de lucrări' },
    { key: 'yourPhone',     label: '📞 Telefonul tău', placeholder: '+40721123456', hint: 'Opțional – apare în emailuri' },
    { key: 'priceFrom',     label: '💰 Preț de la (RON)', placeholder: '500', hint: 'Prețul minim al unui site' },
    { key: 'priceTo',       label: '💰 Preț până la (RON)', placeholder: '1500', hint: 'Prețul maxim' },
    { key: 'deliveryDays',  label: '⚡ Timp livrare (zile)', placeholder: '5', hint: 'Câte zile durează să faci un site' },
    { key: 'senderEmail',        label: '✉️ Email Gmail (sender)', placeholder: 'tine@gmail.com', hint: 'Gmail-ul de pe care trimiți outreach' },
    { key: 'senderAppPassword',  label: '🔑 Gmail App Password', placeholder: 'xxxx xxxx xxxx xxxx', secret: true, hint: 'Generează pe myaccount.google.com → Security → App passwords' },
  ]

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b2a 50%, #0a1628 100%)' }}>
      <header className="border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/leads" className="text-slate-400 hover:text-white transition-colors text-sm">← Leads</Link>
            <span className="text-slate-700">/</span>
            <span className="font-bold text-white">Setări</span>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="glass rounded-3xl p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-extrabold text-white mb-1">Configurare</h1>
            <p className="text-slate-400 text-sm">Setările sunt salvate local în browser (nu pe server)</p>
          </div>

          {fields.map(f => (
            <div key={f.key}>
              <label className="text-sm font-semibold text-white mb-1.5 block">{f.label}</label>
              <input
                type={f.secret ? 'password' : 'text'}
                value={String(settings[f.key] || '')}
                onChange={e => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600"
                style={{ background: 'rgba(15,22,41,0.8)', border: '1px solid rgba(99,179,237,0.15)', outline: 'none' }}
              />
              {f.hint && <p className="text-xs text-slate-500 mt-1">{f.hint}</p>}
            </div>
          ))}

          <button onClick={handleSave}
            className="w-full py-4 rounded-2xl font-bold text-white text-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: saved ? 'linear-gradient(135deg,#25D366,#128C7E)' : 'linear-gradient(135deg,#63b3ed,#3b82f6)', boxShadow: '0 4px 30px rgba(99,179,237,0.3)' }}>
            {saved ? '✅ Salvat!' : '💾 Salvează setările'}
          </button>
        </div>
      </div>
    </div>
  )
}

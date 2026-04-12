'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Search, Loader2, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Plus, Send,
  Wand2, AlertTriangle,
} from 'lucide-react'
import { CITY_COORDINATES, BUSINESS_CATEGORIES } from '@/lib/constants'
import { getSettings, addLeads, updateLead, incrementTodaySent } from '@/lib/storage'
import type { Business } from '@/lib/types'

const CITIES      = Object.keys(CITY_COORDINATES)
const CATEGORIES  = Object.entries(BUSINESS_CATEGORIES)

export default function CampaignPage() {
  const [selectedCities, setSelectedCities] = useState<string[]>(['Cluj-Napoca'])
  const [selectedCats,   setSelectedCats]   = useState<string[]>(['restaurant'])

  const [results,   setResults]   = useState<Business[]>([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [added,     setAdded]     = useState<Set<string>>(new Set())
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [genStatus, setGenStatus] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({})
  const [sendStatus,setSendStatus]= useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({})

  const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]

  // ── Find businesses ───────────────────────────────────────────────────────
  const handleFind = async () => {
    setError('')
    setResults([])
    setLoading(true)
    const settings = getSettings()

    const all: Business[] = []
    for (const city of selectedCities) {
      for (const category of selectedCats) {
        try {
          const res = await fetch('/api/find-businesses', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              city,
              category,
              googleApiKey: settings.googlePlacesApiKey,
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Eroare necunoscută')
          all.push(...(data.businesses || []))
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(prev => prev ? `${prev}\n${msg}` : msg)
        }
      }
    }

    // Dedup by place_id
    const unique = all.filter(
      (b, i, arr) => arr.findIndex(x => x.place_id === b.place_id) === i,
    )
    setResults(unique)
    setLoading(false)
  }

  // ── Add to leads list ─────────────────────────────────────────────────────
  const handleAdd = (biz: Business) => {
    addLeads([biz])
    setAdded(prev => new Set(Array.from(prev).concat(biz.place_id)))
  }

  const handleAddAll = () => {
    addLeads(results)
    setAdded(new Set(results.map(b => b.place_id)))
  }

  // ── Generate email ────────────────────────────────────────────────────────
  const handleGenerate = async (biz: Business, contactEmail: string) => {
    setGenStatus(prev => ({ ...prev, [biz.place_id]: 'loading' }))
    const settings = getSettings()

    try {
      const res = await fetch('/api/generate-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          business:       biz,
          anthropicApiKey: settings.anthropicApiKey,
          senderName:     settings.senderName,
          yourWebsite:    settings.yourWebsite,
          yourPortfolio:  settings.yourPortfolio,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const updated: Business = {
        ...biz,
        contact_email:      contactEmail,
        generated_subject:  data.subject,
        generated_body:     data.body,
        status: 'ready',
      }

      setResults(prev =>
        prev.map(b => b.place_id === biz.place_id ? updated : b),
      )
      updateLead(biz.place_id, updated)
      setGenStatus(prev => ({ ...prev, [biz.place_id]: 'done' }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setGenStatus(prev => ({ ...prev, [biz.place_id]: 'error' }))
    }
  }

  // ── Send email ────────────────────────────────────────────────────────────
  const handleSend = async (biz: Business) => {
    if (!biz.generated_subject || !biz.generated_body || !biz.contact_email) return
    setSendStatus(prev => ({ ...prev, [biz.place_id]: 'loading' }))
    const settings = getSettings()

    try {
      const res = await fetch('/api/send-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          to:               biz.contact_email,
          subject:          biz.generated_subject,
          emailBody:        biz.generated_body,
          senderEmail:      settings.senderEmail,
          senderAppPassword:settings.senderAppPassword,
          senderName:       settings.senderName,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const updated: Business = { ...biz, status: 'sent', sent_at: new Date().toISOString() }
      setResults(prev => prev.map(b => b.place_id === biz.place_id ? updated : b))
      updateLead(biz.place_id, updated)
      incrementTodaySent(true)
      setSendStatus(prev => ({ ...prev, [biz.place_id]: 'done' }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      incrementTodaySent(false)
      setSendStatus(prev => ({ ...prev, [biz.place_id]: 'error' }))
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-white mb-1">Campanie Nouă</h1>
      <p className="text-slate-400 text-sm mb-8">
        Selectează orașe și categorii, găsește afacerile fără website și trimite emailuri.
      </p>

      {/* Config panel */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Cities */}
        <div className="p-5 rounded-xl border border-slate-700 bg-slate-800/50">
          <h2 className="text-white font-semibold mb-3">
            Orașe ({selectedCities.length} selectate)
          </h2>
          <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
            {CITIES.map(city => (
              <label key={city}
                     className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer
                                hover:bg-slate-700/50 transition-colors">
                <input
                  type="checkbox"
                  checked={selectedCities.includes(city)}
                  onChange={() => setSelectedCities(toggle(selectedCities, city))}
                  className="accent-green-500 w-3.5 h-3.5"
                />
                <span className="text-slate-300 text-xs">{city}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="p-5 rounded-xl border border-slate-700 bg-slate-800/50">
          <h2 className="text-white font-semibold mb-3">
            Categorii ({selectedCats.length} selectate)
          </h2>
          <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto pr-1">
            {CATEGORIES.map(([key, label]) => (
              <label key={key}
                     className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer
                                hover:bg-slate-700/50 transition-colors">
                <input
                  type="checkbox"
                  checked={selectedCats.includes(key)}
                  onChange={() => setSelectedCats(toggle(selectedCats, key))}
                  className="accent-green-500 w-3.5 h-3.5"
                />
                <span className="text-slate-300 text-xs">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={handleFind}
          disabled={loading || !selectedCities.length || !selectedCats.length}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl
                     bg-green-500 hover:bg-green-400 disabled:opacity-50
                     disabled:cursor-not-allowed active:scale-95
                     text-black font-semibold text-sm transition-all">
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Caută...</>
            : <><Search className="w-4 h-4" /> Găsește Afaceri</>
          }
        </button>

        {results.length > 0 && (
          <button
            onClick={handleAddAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                       border border-slate-600 hover:border-slate-500
                       bg-slate-800 hover:bg-slate-700
                       text-slate-300 text-sm transition-all">
            <Plus className="w-4 h-4" />
            Adaugă Toate în Leads ({results.length})
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-start gap-2 p-3 rounded-xl
                        bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <pre className="whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {/* Results count */}
      {results.length > 0 && (
        <p className="text-slate-400 text-sm mb-4">
          {results.length} afaceri găsite fără website
        </p>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(biz => {
            const isExpanded  = expanded === biz.place_id
            const isAdded     = added.has(biz.place_id)
            const genSt       = genStatus[biz.place_id]  || 'idle'
            const sendSt      = sendStatus[biz.place_id] || 'idle'
            const emailInput  = biz.contact_email || ''

            return (
              <div key={biz.place_id}
                   className="rounded-xl border border-slate-700 bg-slate-800/50
                              overflow-hidden">
                {/* Row header */}
                <div className="flex items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">{biz.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-400">
                        {biz.category_label}
                      </span>
                      <span className="text-slate-500 text-xs">{biz.city}</span>
                      {biz.rating > 0 && (
                        <span className="text-yellow-400 text-xs">
                          ★ {biz.rating} ({biz.reviews_count})
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5 truncate">{biz.phone}</p>
                  </div>

                  {/* Status badges */}
                  {biz.status === 'sent' && (
                    <span className="flex items-center gap-1 text-green-400 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Trimis
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!isAdded ? (
                      <button
                        onClick={() => handleAdd(biz)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium
                                   bg-slate-700 hover:bg-slate-600 text-slate-300
                                   transition-colors">
                        <Plus className="w-3.5 h-3.5 inline mr-1" />
                        Adaugă
                      </button>
                    ) : (
                      <span className="text-green-400 text-xs">Adăugat ✓</span>
                    )}

                    <button
                      onClick={() => setExpanded(isExpanded ? null : biz.place_id)}
                      className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600
                                 text-slate-400 transition-colors">
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded: email form */}
                {isExpanded && (
                  <div className="border-t border-slate-700 p-4 space-y-4 bg-slate-900/30">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">
                          Email de contact (obligatoriu pentru generare)
                        </label>
                        <input
                          type="email"
                          defaultValue={emailInput}
                          placeholder="contact@afacere.ro"
                          id={`email-${biz.place_id}`}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600
                                     text-white placeholder-slate-500 text-sm
                                     focus:outline-none focus:border-green-500 transition-colors"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <button
                          disabled={genSt === 'loading'}
                          onClick={() => {
                            const inp = document.getElementById(`email-${biz.place_id}`) as HTMLInputElement
                            handleGenerate({ ...biz, contact_email: inp?.value || '' }, inp?.value || '')
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg
                                     bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                                     text-white text-sm font-medium transition-colors">
                          {genSt === 'loading'
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Wand2 className="w-4 h-4" />}
                          Generează Email
                        </button>

                        {biz.generated_subject && (
                          <button
                            disabled={sendSt === 'loading' || biz.status === 'sent'}
                            onClick={() => handleSend(biz)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg
                                       bg-green-600 hover:bg-green-500 disabled:opacity-50
                                       text-white text-sm font-medium transition-colors">
                            {sendSt === 'loading'
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : sendSt === 'done'
                                ? <CheckCircle2 className="w-4 h-4" />
                                : <Send className="w-4 h-4" />}
                            {sendSt === 'done' ? 'Trimis!' : 'Trimite'}
                          </button>
                        )}

                        {genSt === 'error' && (
                          <XCircle className="w-5 h-5 text-red-400" />
                        )}
                      </div>
                    </div>

                    {/* Email preview */}
                    {biz.generated_subject && (
                      <div className="p-4 rounded-lg bg-slate-950 border border-slate-700">
                        <p className="text-xs text-slate-500 mb-0.5">Subject:</p>
                        <p className="text-green-400 font-medium text-sm mb-3">
                          {biz.generated_subject}
                        </p>
                        <p className="text-xs text-slate-500 mb-0.5">Body:</p>
                        <pre className="text-slate-300 text-xs whitespace-pre-wrap font-sans leading-relaxed">
                          {biz.generated_body}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Selectează orașe și categorii, apoi apasă „Găsește Afaceri".</p>
          <p className="text-xs mt-1">
            Dacă nu ai API key Google configurat, mergi la{' '}
            <Link href="/settings" className="text-green-400 hover:underline">Setări</Link>.
          </p>
        </div>
      )}
    </div>
  )
}

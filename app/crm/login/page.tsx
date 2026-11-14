'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, ApiError } from '@/lib/crm/client'
import { Button, Input } from '@/components/crm/ui'

function LoginForm() {
  const router = useRouter()
  const next = useSearchParams().get('next') || '/crm'
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('/api/crm/auth/login', { json: { password } })
      router.push(next.startsWith('/crm') ? next : '/crm')
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Sign-in failed') }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-7">
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-8 h-8 rounded-md bg-teal-600 flex items-center justify-center text-[13px] font-bold text-white">UK</div>
        <div>
          <div className="font-semibold text-slate-900">Business Hunter CRM</div>
          <div className="text-xs text-slate-500">Sign in to continue</div>
        </div>
      </div>
      <label className="block text-[12px] font-medium text-slate-600 mb-1">Password</label>
      <Input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
      {error && <p className="text-sm text-rose-700 mt-2">{error}</p>}
      <Button type="submit" variant="primary" loading={busy} className="w-full mt-4">Sign in</Button>
      <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">The password is the <code>CRM_PASSWORD</code> environment variable set on your server (Vercel → Settings → Environment Variables).</p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f6f8] px-4" style={{ colorScheme: 'light' }}>
      <Suspense><LoginForm /></Suspense>
    </div>
  )
}

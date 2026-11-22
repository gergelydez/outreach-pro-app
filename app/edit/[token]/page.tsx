'use client'

// Linkul primit de client pe WhatsApp: își creează contul (email + parolă) cu codul de 6 cifre.
// Cu un cod nou de la designer, același link resetează parola.
import { useEffect, useState } from 'react'

const T = {
  ro: { title: 'Activează panoul site-ului', sub: 'Aici primești mesajele de pe site și îți schimbi tarifele, ofertele și pozele.', reset: 'Setează o parolă nouă', pin: 'Codul de activare (6 cifre)', email: 'Emailul tău', pw: 'Alege o parolă (minim 8 caractere)', create: 'Creează contul', resetBtn: 'Salvează parola nouă', have: 'Ai deja cont?', signIn: 'Intră aici', wrongPin: 'Cod greșit.', locked: 'Prea multe încercări. Încearcă din nou peste 15 minute.', badLink: 'Linkul nu mai este valabil. Cere un link nou.', emailBad: 'Emailul nu pare corect.', pwBad: 'Parola trebuie să aibă minim 8 caractere.', taken: 'Emailul e deja folosit pentru alt site.', error: 'A apărut o eroare. Încearcă din nou.' },
  hu: { title: 'A weboldal kezelőfelületének aktiválása', sub: 'Itt kapja meg a weboldalról érkező üzeneteket, és itt módosíthatja az árakat, ajánlatokat és képeket.', reset: 'Új jelszó beállítása', pin: 'Aktiváló kód (6 számjegy)', email: 'E-mail címe', pw: 'Jelszó (legalább 8 karakter)', create: 'Fiók létrehozása', resetBtn: 'Új jelszó mentése', have: 'Van már fiókja?', signIn: 'Belépés', wrongPin: 'Hibás kód.', locked: 'Túl sok próbálkozás. Próbálja újra 15 perc múlva.', badLink: 'A link már nem érvényes. Kérjen új linket.', emailBad: 'Az e-mail cím nem tűnik helyesnek.', pwBad: 'A jelszó legalább 8 karakter legyen.', taken: 'Ez az e-mail cím már egy másik weboldalhoz tartozik.', error: 'Hiba történt. Próbálja újra.' },
  en: { title: 'Activate your website panel', sub: 'Get your website messages here and update your prices, offers and photos.', reset: 'Set a new password', pin: 'Activation code (6 digits)', email: 'Your email', pw: 'Choose a password (at least 8 characters)', create: 'Create account', resetBtn: 'Save new password', have: 'Already have an account?', signIn: 'Sign in', wrongPin: 'Wrong code.', locked: 'Too many attempts. Try again in 15 minutes.', badLink: 'This link is no longer valid. Ask for a new one.', emailBad: 'That email does not look right.', pwBad: 'The password needs at least 8 characters.', taken: 'This email is already used for another website.', error: 'Something went wrong. Please try again.' },
}

const input = 'w-full h-12 rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500'

export default function Invite({ params }: { params: { token: string } }) {
  const [info, setInfo] = useState<{ name: string; country: string; has_account: boolean } | null>(null)
  const [bad, setBad] = useState(false)
  const [f, setF] = useState({ pin: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const t = T[info?.country === 'HU' ? 'hu' : info?.country === 'UK' ? 'en' : 'ro']

  useEffect(() => {
    fetch(`/api/client/register?token=${encodeURIComponent(params.token)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject())).then(setInfo).catch(() => setBad(true))
  }, [params.token])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (f.password.length < 8) { setErr(t.pwBad); return }
    setBusy(true)
    const r = await fetch('/api/client/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: params.token, ...f }) })
    setBusy(false)
    if (r.ok) { location.href = '/client'; return }
    const d = await r.json().catch(() => ({}))
    setErr(r.status === 429 ? t.locked : r.status === 404 ? t.badLink : r.status === 401 ? t.wrongPin : d.error === 'email' ? t.emailBad : d.error === 'password' ? t.pwBad : d.error === 'email_taken' ? t.taken : t.error)
  }

  return (
    <main className="min-h-[100dvh] bg-[#f4f5f7] text-slate-900">
      <div className="bg-slate-900 text-white px-6 pt-[max(48px,env(safe-area-inset-top))] pb-16">
        <img src="/icons/client-192.png" alt="" className="w-12 h-12 rounded-xl mb-5" />
        <div className="text-[12px] uppercase tracking-[.14em] text-slate-400">{info?.name || ''}</div>
        <h1 className="text-[26px] font-semibold tracking-tight leading-tight mt-1">{info?.has_account ? t.reset : t.title}</h1>
        <p className="text-[14px] text-slate-300 mt-2 max-w-md">{t.sub}</p>
      </div>
      {bad ? <p className="mx-4 -mt-8 bg-white rounded-2xl border border-slate-200 p-5 text-rose-600">{T.ro.badLink}</p> : (
        <form onSubmit={submit} className="mx-4 -mt-10 bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_16px_rgba(15,23,42,.06)] p-5 space-y-4 max-w-md">
          <label className="block text-[13px] font-medium text-slate-600">{t.pin}
            <input className={`${input} mt-1.5 text-center text-2xl tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={f.pin} onChange={e => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} required />
          </label>
          <label className="block text-[13px] font-medium text-slate-600">{t.email}<input className={`${input} mt-1.5`} type="email" autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></label>
          <label className="block text-[13px] font-medium text-slate-600">{t.pw}<input className={`${input} mt-1.5`} type="password" autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} minLength={8} required /></label>
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <button className="w-full h-12 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50" disabled={busy || f.pin.length !== 6 || !info}>{busy ? '…' : info?.has_account ? t.resetBtn : t.create}</button>
          {info?.has_account && <p className="text-[13px] text-slate-500 text-center">{t.have} <a className="underline text-slate-800" href="/client">{t.signIn}</a></p>}
        </form>
      )}
    </main>
  )
}

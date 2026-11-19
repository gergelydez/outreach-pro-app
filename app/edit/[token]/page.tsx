'use client'

// Panoul clientului: tarife, oferte, galerie, contact. Fără cont: link privat + PIN de 6 cifre.
import { useEffect, useState } from 'react'
import { shrinkImage } from '@/lib/client-image'

interface Content {
  contact: { phone: string; email: string; address: string; hours: string }
  prices: { name: string; price: string; note: string }[]
  offers: { title: string; text: string; from: string; to: string; active: boolean }[]
  gallery: { src: string; alt: string }[]
}

const T = {
  ro: {
    title: 'Administrare site', messages: 'Mesaje de pe site', noMessages: 'Încă niciun mesaj. Mesajele din formularul site-ului apar aici și pe email.', reply: 'Răspunde', call: 'Sună', pinLabel: 'Codul de acces (6 cifre)', enter: 'Intră', wrongPin: 'Cod greșit.', locked: 'Prea multe încercări. Încearcă din nou peste 15 minute.', badLink: 'Linkul nu mai este valabil.',
    contact: 'Contact', phone: 'Telefon', email: 'Email', address: 'Adresă', hours: 'Program', prices: 'Tarife', name: 'Denumire', price: 'Preț', note: 'Notă (opțional)', addPrice: '+ Adaugă tarif',
    offers: 'Oferte și promoții', offerTitle: 'Titlu', offerText: 'Descriere', from: 'De la', to: 'Până la', active: 'Activă', addOffer: '+ Adaugă ofertă', offersHint: 'Ofertele expirate dispar singure de pe site.',
    gallery: 'Galerie foto', addPhotos: '+ Adaugă poze', uploading: 'Se încarcă pozele…', galleryHint: 'Prima poză apare prima în galerie.',
    save: 'Salvează', saving: 'Se salvează…', saved: 'Salvat ✓ Apare pe site în câteva secunde.', unsaved: 'Ai modificări nesalvate', view: 'Vezi site-ul', logout: 'Ieși', remove: 'Șterge', error: 'A apărut o eroare. Încearcă din nou.',
  },
  hu: {
    title: 'Weboldal kezelése', messages: 'Üzenetek az oldalról', noMessages: 'Még nincs üzenet. A weboldal űrlapjáról érkező üzenetek itt és e-mailben jelennek meg.', reply: 'Válasz', call: 'Hívás', pinLabel: 'Belépési kód (6 számjegy)', enter: 'Belépés', wrongPin: 'Hibás kód.', locked: 'Túl sok próbálkozás. Próbálja újra 15 perc múlva.', badLink: 'A link már nem érvényes.',
    contact: 'Elérhetőség', phone: 'Telefon', email: 'E-mail', address: 'Cím', hours: 'Nyitvatartás', prices: 'Árak', name: 'Megnevezés', price: 'Ár', note: 'Megjegyzés (nem kötelező)', addPrice: '+ Új ár',
    offers: 'Ajánlatok, akciók', offerTitle: 'Cím', offerText: 'Leírás', from: 'Kezdete', to: 'Vége', active: 'Aktív', addOffer: '+ Új ajánlat', offersHint: 'A lejárt ajánlatok automatikusan eltűnnek az oldalról.',
    gallery: 'Fotógaléria', addPhotos: '+ Képek hozzáadása', uploading: 'Képek feltöltése…', galleryHint: 'Az első kép jelenik meg elsőként.',
    save: 'Mentés', saving: 'Mentés…', saved: 'Mentve ✓ Néhány másodperc múlva megjelenik az oldalon.', unsaved: 'Nem mentett változások', view: 'Az oldal megtekintése', logout: 'Kilépés', remove: 'Törlés', error: 'Hiba történt. Próbálja újra.',
  },
  en: {
    title: 'Manage your website', messages: 'Website messages', noMessages: 'No messages yet. Messages from your website form appear here and by email.', reply: 'Reply', call: 'Call', pinLabel: 'Access code (6 digits)', enter: 'Sign in', wrongPin: 'Wrong code.', locked: 'Too many attempts. Try again in 15 minutes.', badLink: 'This link is no longer valid.',
    contact: 'Contact', phone: 'Phone', email: 'Email', address: 'Address', hours: 'Opening hours', prices: 'Prices', name: 'Name', price: 'Price', note: 'Note (optional)', addPrice: '+ Add price',
    offers: 'Offers & promotions', offerTitle: 'Title', offerText: 'Description', from: 'From', to: 'Until', active: 'Active', addOffer: '+ Add offer', offersHint: 'Expired offers disappear from the site automatically.',
    gallery: 'Photo gallery', addPhotos: '+ Add photos', uploading: 'Uploading photos…', galleryHint: 'The first photo is shown first.',
    save: 'Save', saving: 'Saving…', saved: 'Saved ✓ It will show on the site in a few seconds.', unsaved: 'Unsaved changes', view: 'View site', logout: 'Sign out', remove: 'Remove', error: 'Something went wrong. Please try again.',
  },
}
interface Msg { id: string; name: string; email: string; phone: string; message: string; extra: Record<string, string> | null; created_at: string }
type Lang = keyof typeof T

const input = 'w-full h-11 rounded-lg border border-slate-300 px-3 text-[15px] bg-white text-slate-900 placeholder:text-slate-400'
function move<X>(list: X[], i: number, d: number): X[] { const j = i + d; if (j < 0 || j >= list.length) return list; const c = list.slice(); [c[i], c[j]] = [c[j], c[i]]; return c }

export default function EditPage({ params }: { params: { token: string } }) {
  const key = `portal_pin_${params.token}`
  const [lang, setLang] = useState<Lang>('ro')
  const t = T[lang]
  const [pin, setPin] = useState('')
  const [name, setName] = useState('')
  const [bid, setBid] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [data, setData] = useState<Content | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  async function login(p: string, quiet = false) {
    setBusy('login'); setErr('')
    try {
      const res = await fetch(`/api/portal/${params.token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: p }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        try { localStorage.removeItem(key) } catch { /* */ }
        if (!quiet) setErr(res.status === 429 ? t.locked : res.status === 404 ? t.badLink : t.wrongPin)
      } else {
        setLang(d.country === 'HU' ? 'hu' : d.country === 'UK' ? 'en' : 'ro')
        setName(d.name); setBid(d.id); setPreview(d.preview_url); setData(d.content); setMessages(d.messages || []); setPin(p)
        try { localStorage.setItem(key, p) } catch { /* */ }
      }
    } catch { if (!quiet) setErr(t.error) }
    setBusy('')
  }
  useEffect(() => { try { const p = localStorage.getItem(key); if (p) login(p, true) } catch { /* */ } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function update(fn: (c: Content) => Content) { setData(c => (c ? fn(c) : c)); setDirty(true); setMsg('') }

  async function save() {
    if (!data) return
    setBusy('save'); setErr(''); setMsg('')
    try {
      const res = await fetch(`/api/portal/${params.token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, content: data }) })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setData(d.content); setDirty(false); setMsg(t.saved)
    } catch { setErr(t.error) }
    setBusy('')
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    setBusy('upload'); setErr('')
    const { upload } = await import('@vercel/blob/client')
    const added: { src: string; alt: string }[] = []
    for (const f of Array.from(files).slice(0, 30)) {
      try {
        const blob = await upload(`cms/${bid}/${Date.now()}.jpg`, await shrinkImage(f), { access: 'public', handleUploadUrl: `/api/portal/${params.token}/upload`, clientPayload: JSON.stringify({ pin }), contentType: 'image/jpeg' })
        added.push({ src: blob.url, alt: '' })
      } catch { /* o poză stricată nu oprește restul */ }
    }
    if (added.length) update(c => ({ ...c, gallery: [...c.gallery, ...added] }))
    else setErr(t.error)
    setBusy('')
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-slate-900">
        <form className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6 space-y-4" onSubmit={e => { e.preventDefault(); login(pin) }}>
          <h1 className="text-xl font-semibold text-slate-900">🔑 {t.title}</h1>
          <label className="block text-sm text-slate-600">{t.pinLabel}
            <input className={`${input} mt-1 text-center text-2xl tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
          </label>
          {err && <p className="text-sm text-rose-700">{err}</p>}
          <button className="w-full h-12 rounded-xl bg-teal-700 text-white font-semibold disabled:opacity-50" disabled={pin.length !== 6 || busy === 'login'}>{t.enter}</button>
        </form>
      </main>
    )
  }

  const card = 'bg-white rounded-2xl border border-slate-200 p-4 space-y-3'
  const small = 'h-9 w-9 shrink-0 rounded-lg border border-slate-300 text-sm bg-white text-slate-700'
  return (
    <main className="min-h-screen bg-slate-50 pb-28 text-slate-900">
      <header className="bg-slate-900 text-white px-4 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0"><div className="text-[12px] text-slate-400">{t.title}</div><div className="font-semibold truncate">{name}</div></div>
          <div className="flex gap-2 shrink-0">
            {preview && <a href={preview} target="_blank" rel="noreferrer" className="h-9 px-3 inline-flex items-center rounded-lg bg-white/10 text-sm">{t.view}</a>}
            <button className="h-9 px-3 rounded-lg bg-white/10 text-sm" onClick={() => { try { localStorage.removeItem(key) } catch { /* */ } setData(null); setPin('') }}>{t.logout}</button>
          </div>
        </div>
      </header>
      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        <section className={card}>
          <h2 className="font-semibold text-slate-900">📩 {t.messages}{messages.length ? ` · ${messages.length}` : ''}</h2>
          {!messages.length ? <p className="text-[13px] text-slate-500">{t.noMessages}</p> : messages.slice(0, 20).map(m => (
            <div key={m.id} className="rounded-xl border border-slate-200 p-3 text-[14px] space-y-1">
              <div className="flex justify-between gap-2"><b>{m.name || m.email || m.phone}</b><span className="text-[12px] text-slate-400 shrink-0">{new Date(m.created_at).toLocaleString(lang === 'hu' ? 'hu-HU' : lang === 'en' ? 'en-GB' : 'ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
              {m.extra && (m.extra.checkin || m.extra.checkout || m.extra.guests) && <div className="text-[13px] text-slate-600">📅 {[m.extra.checkin, m.extra.checkout].filter(Boolean).join(' → ')}{m.extra.guests ? ` · 👥 ${m.extra.guests}` : ''}</div>}
              {m.message && <p className="whitespace-pre-wrap text-slate-700">{m.message}</p>}
              <div className="flex gap-2 pt-1">
                {m.phone && <a className="h-9 px-3 inline-flex items-center rounded-lg border border-slate-300 text-sm" href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}>📞 {t.call}</a>}
                {m.email && <a className="h-9 px-3 inline-flex items-center rounded-lg border border-slate-300 text-sm" href={`mailto:${m.email}`}>✉️ {t.reply}</a>}
              </div>
            </div>
          ))}
        </section>

        <section className={card}>
          <h2 className="font-semibold text-slate-900">☎️ {t.contact}</h2>
          {(['phone', 'email', 'address'] as const).map(k => (
            <label key={k} className="block text-sm text-slate-600">{t[k]}<input className={`${input} mt-1`} value={data.contact[k]} onChange={e => update(c => ({ ...c, contact: { ...c.contact, [k]: e.target.value } }))} /></label>
          ))}
          <label className="block text-sm text-slate-600">{t.hours}<textarea className={`${input} mt-1 h-24 py-2`} value={data.contact.hours} onChange={e => update(c => ({ ...c, contact: { ...c.contact, hours: e.target.value } }))} /></label>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-slate-900">💶 {t.prices}</h2>
          {data.prices.map((p, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2">
              <input className={input} placeholder={t.name} value={p.name} onChange={e => update(c => ({ ...c, prices: c.prices.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
              <div className="flex gap-2">
                <input className={input} placeholder={t.price} value={p.price} onChange={e => update(c => ({ ...c, prices: c.prices.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) }))} />
                <button className={small} onClick={() => update(c => ({ ...c, prices: move(c.prices, i, -1) }))}>↑</button>
                <button className={small} onClick={() => update(c => ({ ...c, prices: move(c.prices, i, 1) }))}>↓</button>
                <button className={`${small} text-rose-700`} aria-label={t.remove} onClick={() => update(c => ({ ...c, prices: c.prices.filter((_, j) => j !== i) }))}>🗑</button>
              </div>
              <input className={input} placeholder={t.note} value={p.note} onChange={e => update(c => ({ ...c, prices: c.prices.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) }))} />
            </div>
          ))}
          <button className="h-11 w-full rounded-xl border-2 border-dashed border-slate-300 text-slate-600 font-medium" onClick={() => update(c => ({ ...c, prices: [...c.prices, { name: '', price: '', note: '' }] }))}>{t.addPrice}</button>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-slate-900">🎁 {t.offers}</h2>
          <p className="text-[12px] text-slate-500">{t.offersHint}</p>
          {data.offers.map((o, i) => (
            <div key={i} className={`rounded-xl border p-3 space-y-2 ${o.active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
              <input className={input} placeholder={t.offerTitle} value={o.title} onChange={e => update(c => ({ ...c, offers: c.offers.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))} />
              <textarea className={`${input} h-20 py-2`} placeholder={t.offerText} value={o.text} onChange={e => update(c => ({ ...c, offers: c.offers.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[12px] text-slate-500">{t.from}<input type="date" className={input} value={o.from} onChange={e => update(c => ({ ...c, offers: c.offers.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) }))} /></label>
                <label className="text-[12px] text-slate-500">{t.to}<input type="date" className={input} value={o.to} onChange={e => update(c => ({ ...c, offers: c.offers.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) }))} /></label>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 mr-auto"><input type="checkbox" className="w-5 h-5" checked={o.active} onChange={e => update(c => ({ ...c, offers: c.offers.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)) }))} />{t.active}</label>
                <button className={small} onClick={() => update(c => ({ ...c, offers: move(c.offers, i, -1) }))}>↑</button>
                <button className={small} onClick={() => update(c => ({ ...c, offers: move(c.offers, i, 1) }))}>↓</button>
                <button className={`${small} text-rose-700`} aria-label={t.remove} onClick={() => update(c => ({ ...c, offers: c.offers.filter((_, j) => j !== i) }))}>🗑</button>
              </div>
            </div>
          ))}
          <button className="h-11 w-full rounded-xl border-2 border-dashed border-slate-300 text-slate-600 font-medium" onClick={() => update(c => ({ ...c, offers: [...c.offers, { title: '', text: '', from: '', to: '', active: true }] }))}>{t.addOffer}</button>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-slate-900">🖼️ {t.gallery}</h2>
          <p className="text-[12px] text-slate-500">{t.galleryHint}</p>
          <div className="grid grid-cols-3 gap-2">
            {data.gallery.map((g, i) => (
              <div key={g.src} className="relative">
                <img src={g.src} alt="" className="w-full aspect-square object-cover rounded-lg border border-slate-200" />
                <div className="absolute inset-x-1 bottom-1 flex justify-between">
                  <button className="h-7 w-7 rounded-md bg-white/90 text-xs" onClick={() => update(c => ({ ...c, gallery: move(c.gallery, i, -1) }))}>←</button>
                  <button className="h-7 w-7 rounded-md bg-white/90 text-xs text-rose-700" aria-label={t.remove} onClick={() => update(c => ({ ...c, gallery: c.gallery.filter((_, j) => j !== i) }))}>🗑</button>
                  <button className="h-7 w-7 rounded-md bg-white/90 text-xs" onClick={() => update(c => ({ ...c, gallery: move(c.gallery, i, 1) }))}>→</button>
                </div>
              </div>
            ))}
          </div>
          <label className="h-11 w-full rounded-xl border-2 border-dashed border-slate-300 text-slate-600 font-medium inline-flex items-center justify-center cursor-pointer">
            {busy === 'upload' ? t.uploading : t.addPhotos}
            <input type="file" accept="image/*" multiple className="hidden" disabled={busy === 'upload'} onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
          </label>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-white/95 border-t border-slate-200 p-3">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <div className="flex-1 text-[13px]">{err ? <span className="text-rose-700">{err}</span> : msg ? <span className="text-emerald-700">{msg}</span> : dirty ? <span className="text-amber-700">{t.unsaved}</span> : null}</div>
          <button className="h-12 px-6 rounded-xl bg-teal-700 text-white font-semibold disabled:opacity-50" disabled={!dirty || busy === 'save' || busy === 'upload'} onClick={save}>{busy === 'save' ? t.saving : `💾 ${t.save}`}</button>
        </div>
      </div>
    </main>
  )
}

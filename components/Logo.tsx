import { useId } from 'react'

// Logo Outreach Pro: un pin de hartă (găsești afaceri locale pe Google Maps) care e și un
// balon de chat (le scrii pe WhatsApp), cu o scânteie (AI). Același desen ca app/icon.svg.
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  // id-uri unice per logo: dacă un logo e ascuns (meniul de pe mobil), celelalte își păstrează gradientul
  const id = useId().replace(/:/g, '')
  const bg = `op-bg-${id}`, dots = `op-dots-${id}`, shine = `op-shine-${id}`
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="Outreach Pro">
      <defs>
        <linearGradient id={bg} x1="6" y1="4" x2="60" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34D399" />
          <stop offset="0.45" stopColor="#0EA5A0" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id={dots} x1="22" y1="26" x2="42" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0D9488" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
        <radialGradient id={shine} cx="18" cy="10" r="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${bg})`} />
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${shine})`} />
      <path fill="#0b1b3a" opacity=".18" d="M32 13.5c-9.7 0-17.5 7.6-17.5 17 0 12.2 14.6 23.6 16 24.7a2.4 2.4 0 0 0 3 0c1.4-1.1 16-12.5 16-24.7 0-9.4-7.8-17-17.5-17z" />
      <path fill="#fff" d="M32 11.5c-9.7 0-17.5 7.6-17.5 17 0 12.2 14.6 23.6 16 24.7a2.4 2.4 0 0 0 3 0c1.4-1.1 16-12.5 16-24.7 0-9.4-7.8-17-17.5-17z" />
      <circle cx="25.2" cy="28.6" r="2.7" fill={`url(#${dots})`} />
      <circle cx="32" cy="28.6" r="2.7" fill={`url(#${dots})`} />
      <circle cx="38.8" cy="28.6" r="2.7" fill={`url(#${dots})`} />
      <path fill="#fff" opacity=".95" d="M50.5 9.5l1.25 3.25 3.25 1.25-3.25 1.25-1.25 3.25-1.25-3.25-3.25-1.25 3.25-1.25z" />
    </svg>
  )
}

// Logo + nume: „Outreach PRO”
export function Logo({ size = 36, dark = true, sub }: { size?: number; dark?: boolean; sub?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="leading-tight">
        <span className={`block font-extrabold tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`} style={{ fontSize: size * 0.5 }}>
          Outreach
          <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-white align-middle" style={{ fontSize: size * 0.3, background: 'linear-gradient(135deg,#34D399,#0EA5A0 45%,#4F46E5)' }}>PRO</span>
        </span>
        {sub && <span className={`block text-[10px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{sub}</span>}
      </span>
    </span>
  )
}

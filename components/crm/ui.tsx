'use client'

// Componente comune ale CRM-ului: carduri, butoane, badge-uri, stări goale.
// Paletă restrânsă: neutru (slate), accent teal, amber pentru atenție, rose pentru probleme.
import Link from 'next/link'
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { WEBSITE_STATUS_LABEL, stageLabel, opportunityLabel } from '@/lib/crm/constants'
import type { ApiError } from '@/lib/crm/client'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className, title, action, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx('bg-white border border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
          <h2 className="text-[13px] font-semibold text-slate-700 uppercase tracking-wide">{title}</h2>
          {action}
        </div>
      )}
      <div className={pad ? 'px-4 pb-4 pt-1' : ''}>{children}</div>
    </section>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean }
export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button {...rest} disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        variant === 'primary' && 'bg-teal-700 text-white hover:bg-teal-800 shadow-sm',
        variant === 'secondary' && 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        variant === 'danger' && 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50', className)}>
      {loading && <span className="w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}

export function ButtonLink({ href, children, variant = 'secondary' }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary' }) {
  return <Link href={href} className={cx('inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-medium', variant === 'primary' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50')}>{children}</Link>
}

export const inputCls = 'h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600'
// lățime implicită 100%, doar dacă nu s-a cerut alta (altfel w-full ar câștiga în CSS)
const width = (c?: string) => (c && /(^|\s)(w-|flex-1)/.test(c) ? '' : 'w-full')
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, width(p.className), p.className)} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, 'pr-8', width(p.className), p.className)} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, 'h-auto py-2 leading-relaxed', width(p.className), p.className)} />

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-slate-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  )
}

const TONES = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  accent: 'bg-teal-50 text-teal-800 ring-teal-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  bad: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
}
export type Tone = keyof typeof TONES
export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span title={title} className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ring-1 ring-inset whitespace-nowrap', TONES[tone])}>{children}</span>
}

const STATUS_TONE: Record<string, Tone> = {
  NO_WEBSITE: 'bad', BROKEN_WEBSITE: 'bad', SOCIAL_ONLY: 'warn', DIRECTORY_ONLY: 'warn', FREE_SUBDOMAIN: 'warn',
  OUTDATED_WEBSITE: 'warn', NEEDS_REDESIGN: 'warn', GOOD_WEBSITE: 'good', UNVERIFIED: 'neutral',
}
export const WebsiteBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] || 'neutral'}>{WEBSITE_STATUS_LABEL[status] || status}</Badge>

export function WhatsAppBadge({ status }: { status: string }) {
  if (status === 'FOUND') return <Badge tone="good">WhatsApp found</Badge>
  if (status === 'NOT_FOUND') return <Badge tone="neutral" title="No public WhatsApp link was detected on the website. This does not mean they don't use WhatsApp.">No WhatsApp link</Badge>
  return <Badge tone="neutral">WhatsApp unverified</Badge>
}

export function ScoreBadge({ score, showLabel = false }: { score: number | null; showLabel?: boolean }) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>
  const l = opportunityLabel(score)
  const cls = l.key === 'excellent' ? 'bg-teal-700 text-white' : l.key === 'high' ? 'bg-teal-100 text-teal-900' : l.key === 'medium' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('inline-flex items-center justify-center min-w-[34px] h-6 px-1.5 rounded-md text-[12px] font-semibold tabular-nums', cls)}>{score}</span>
      {showLabel && <span className="text-xs text-slate-500">{l.label}</span>}
    </span>
  )
}

export const StageBadge = ({ stage }: { stage: string }) => (
  <Badge tone={stage === 'won' ? 'good' : stage === 'lost' || stage === 'not_a_fit' ? 'neutral' : ['interested', 'call_meeting', 'proposal_sent', 'negotiation'].includes(stage) ? 'accent' : 'info'}>{stageLabel(stage)}</Badge>
)

export function Kpi({ label, value, hint, emphasis }: { label: string; value: ReactNode; hint?: ReactNode; emphasis?: boolean }) {
  return (
    <div className={cx('rounded-xl border px-4 py-3', emphasis ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200/80')}>
      <div className={cx('text-[11px] font-medium uppercase tracking-wide', emphasis ? 'text-slate-400' : 'text-slate-500')}>{label}</div>
      <div className={cx('text-2xl font-semibold tabular-nums mt-1', emphasis ? 'text-white' : 'text-slate-900')}>{value}</div>
      {hint && <div className={cx('text-[11px] mt-0.5', emphasis ? 'text-slate-400' : 'text-slate-500')}>{hint}</div>}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      </div>
      <div className="text-sm font-medium text-slate-800">{title}</div>
      {children && <div className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// Afișat când API-ul spune că lipsește o configurare (bază de date, chei, migrații)
export function ApiErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const setup = error.setup
  return (
    <div className={cx('rounded-xl border p-4 text-sm', setup ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-rose-200 bg-rose-50 text-rose-800')}>
      <div className="font-medium">{setup ? 'Setup needed' : 'Something went wrong'}</div>
      <div className="mt-1">{error.message}</div>
      <div className="mt-3 flex gap-2">
        {setup && <ButtonLink href="/crm/settings">Open Settings & API</ButtonLink>}
        {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
      </div>
    </div>
  )
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-9 rounded-lg bg-slate-100 animate-pulse" />)}</div>
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
      {items.map(i => (
        <button key={i.key} onClick={() => onChange(i.key)}
          className={cx('px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap', value === i.key ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800')}>
          {i.label}
        </button>
      ))}
    </div>
  )
}

export function Toast({ message, tone = 'good', onClose }: { message: string | null; tone?: 'good' | 'bad'; onClose: () => void }) {
  if (!message) return null
  return (
    <div className={cx('fixed bottom-4 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg flex items-start gap-3', tone === 'good' ? 'bg-slate-900 text-white' : 'bg-rose-700 text-white')}>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100" aria-label="Close">✕</button>
    </div>
  )
}

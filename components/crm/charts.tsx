'use client'

// Grafice SVG simple, fără dependențe: bare (zile), bare orizontale (distribuții).

export function ColumnChart({ data, height = 140, target }: { data: { label: string; value: number }[]; height?: number; target?: number }) {
  const max = Math.max(1, target || 0, ...data.map(d => d.value))
  const w = 100 / Math.max(1, data.length)
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Chart">
        {target ? <line x1="0" x2="100" y1={height - (target / max) * (height - 10)} y2={height - (target / max) * (height - 10)} stroke="#d97706" strokeDasharray="1.5 1.5" strokeWidth="0.4" vectorEffect="non-scaling-stroke" /> : null}
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 10)
          return <rect key={i} x={i * w + w * 0.18} y={height - h} width={w * 0.64} height={Math.max(h, d.value ? 1 : 0)} rx="0.6" fill={i === data.length - 1 ? '#0f766e' : '#94a3b8'}><title>{`${d.label}: ${d.value}`}</title></rect>
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{data[0]?.label}</span>{target ? <span className="text-amber-700">Target {target}/day</span> : null}<span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  )
}

export function BarList({ data, format = (n: number) => String(n), labelFor = (k: string) => k }: { data: { key: string; n: number }[]; format?: (n: number) => string; labelFor?: (k: string) => string }) {
  const max = Math.max(1, ...data.map(d => d.n))
  if (!data.length) return <div className="text-sm text-slate-400 py-4">No data in this period.</div>
  return (
    <div className="space-y-1.5">
      {data.map(d => (
        <div key={d.key} className="grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-2 text-[13px]">
          <span className="truncate text-slate-600" title={labelFor(d.key)}>{labelFor(d.key)}</span>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-teal-600" style={{ width: `${(d.n / max) * 100}%` }} /></div>
          <span className="tabular-nums text-slate-800 font-medium">{format(d.n)}</span>
        </div>
      ))}
    </div>
  )
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0)
  return <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-teal-600 rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
}

// CSV cu protecție la „formula injection”: celulele care încep cu = + - @ primesc un apostrof
export function csvCell(v: unknown): string {
  let s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function toCsv(rows: Record<string, unknown>[], cols: string[]): string {
  return '\ufeff' + [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n')
}

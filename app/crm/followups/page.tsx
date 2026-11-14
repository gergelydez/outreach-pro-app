'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { api, useApi, dateUk, relative } from '@/lib/crm/client'
import { PageHeader, Card, Button, Input, Select, Badge, ApiErrorNotice, Skeleton, Toast, cx, Tabs } from '@/components/crm/ui'

/* eslint-disable @typescript-eslint/no-explicit-any */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function FollowupsPage() {
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const lists = useApi<any>('/api/crm/followups')
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const from = ymd(new Date(month.getFullYear(), month.getMonth(), 1 - ((month.getDay() + 6) % 7)))
  const toDate = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const to = ymd(new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + (7 - ((toDate.getDay() + 6) % 7 + 1))))
  const cal = useApi<any>(view === 'calendar' ? `/api/crm/followups?from=${from}&to=${to}` : null)
  const [form, setForm] = useState({ title: '', due_at: ymd(new Date()), priority: 'normal' })
  const [toast, setToast] = useState<string | null>(null)

  async function update(id: string, body: Record<string, unknown>, msg: string) {
    try { await api(`/api/crm/followups/${id}`, { method: 'PATCH', json: body }); setToast(msg); lists.reload(); cal.reload() } catch (e) { setToast(e instanceof Error ? e.message : 'Failed') }
  }

  const days = useMemo(() => {
    const out: Date[] = []
    const start = new Date(from)
    for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); if (ymd(d) > to) break; out.push(d) }
    return out
  }, [from, to])

  const Task = ({ t }: { t: any }) => (
    <li className="flex items-start gap-3 py-2.5">
      <button onClick={() => update(t.id, { status: t.status === 'done' ? 'open' : 'done' }, t.status === 'done' ? 'Reopened' : 'Completed')}
        className={cx('mt-0.5 w-4 h-4 rounded border flex items-center justify-center', t.status === 'done' ? 'bg-teal-700 border-teal-700 text-white' : 'border-slate-300')} aria-label="Toggle done">{t.status === 'done' ? '✓' : ''}</button>
      <div className="flex-1 min-w-0">
        <div className={cx('text-sm', t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800')}>{t.title}</div>
        <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-0.5">
          <span className={cx(t.status === 'open' && new Date(t.due_at) < new Date(new Date().toDateString()) && 'text-rose-700 font-medium')}>{dateUk(t.due_at)} ({relative(t.due_at)})</span>
          {t.business_id && <Link href={`/crm/leads/${t.business_id}`} className="text-teal-700">{t.business_name}</Link>}
          {t.priority === 'high' && <Badge tone="warn">high</Badge>}
        </div>
        {t.notes && <div className="text-xs text-slate-500 mt-0.5">{t.notes}</div>}
      </div>
      {t.status === 'open' && (
        <div className="flex gap-1 text-xs">
          <button className="text-slate-500 hover:text-teal-700" onClick={() => update(t.id, { due_at: new Date(Date.now() + 86400_000).toISOString() }, 'Moved to tomorrow')}>+1d</button>
          <button className="text-slate-500 hover:text-teal-700" onClick={() => update(t.id, { due_at: new Date(Date.now() + 7 * 86400_000).toISOString() }, 'Moved by a week')}>+1w</button>
        </div>
      )}
    </li>
  )

  return (
    <>
      <PageHeader title="Follow-ups" subtitle="Reminders only — nothing is sent automatically. Suggested rhythm: day 3, day 7 and day 14 after the first contact (editable in Settings)." />
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2 items-center pt-2">
          <Input className="flex-1 min-w-[200px]" placeholder="New task (not linked to a lead)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Input type="date" className="w-40" value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })} />
          <Select className="w-32" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></Select>
          <Button variant="primary" disabled={!form.title.trim()} onClick={async () => { await api('/api/crm/followups', { json: { ...form, due_at: `${form.due_at}T09:00:00` } }); setForm({ ...form, title: '' }); setToast('Task added'); lists.reload(); cal.reload() }}>Add task</Button>
        </div>
      </Card>
      <Tabs value={view} onChange={setView} items={[{ key: 'list', label: 'Task list' }, { key: 'calendar', label: 'Calendar' }]} />
      <div className="mt-4">
        {lists.error ? <ApiErrorNotice error={lists.error} onRetry={lists.reload} /> : view === 'list' ? (
          !lists.data ? <Skeleton /> : (
            <div className="grid lg:grid-cols-3 gap-4 items-start">
              <Card title={<span className="text-rose-700">Overdue ({lists.data.overdue.length})</span>}>{lists.data.overdue.length ? <ul className="divide-y divide-slate-100">{lists.data.overdue.map((t: any) => <Task key={t.id} t={t} />)}</ul> : <p className="text-sm text-slate-500 py-2">Nothing overdue.</p>}</Card>
              <Card title={`Today (${lists.data.today.length})`}>{lists.data.today.length ? <ul className="divide-y divide-slate-100">{lists.data.today.map((t: any) => <Task key={t.id} t={t} />)}</ul> : <p className="text-sm text-slate-500 py-2">Nothing due today.</p>}</Card>
              <Card title={`Upcoming (${lists.data.upcoming.length})`}>{lists.data.upcoming.length ? <ul className="divide-y divide-slate-100">{lists.data.upcoming.map((t: any) => <Task key={t.id} t={t} />)}</ul> : <p className="text-sm text-slate-500 py-2">No upcoming tasks.</p>}</Card>
            </div>
          )
        ) : (
          <Card title={month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} action={<div className="flex gap-1">
            <Button size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</Button>
            <Button size="sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Today</Button>
            <Button size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</Button>
          </div>}>
            <div className="grid grid-cols-7 text-[11px] uppercase text-slate-400 mb-1">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="px-1">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden">
              {days.map(d => {
                const tasks = (cal.data?.tasks || []).filter((t: any) => ymd(new Date(t.due_at)) === ymd(d))
                return (
                  <div key={ymd(d)} className={cx('bg-white min-h-[88px] p-1', d.getMonth() !== month.getMonth() && 'bg-slate-50')}>
                    <div className={cx('text-[11px] mb-0.5', ymd(d) === ymd(new Date()) ? 'font-bold text-teal-700' : 'text-slate-400')}>{d.getDate()}</div>
                    {tasks.slice(0, 3).map((t: any) => (
                      <Link key={t.id} href={t.business_id ? `/crm/leads/${t.business_id}` : '#'} title={t.title}
                        className={cx('block truncate text-[11px] rounded px-1 py-0.5 mb-0.5', t.status === 'done' ? 'bg-slate-100 text-slate-400 line-through' : new Date(t.due_at) < new Date() ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-800')}>{t.business_name || t.title}</Link>
                    ))}
                    {tasks.length > 3 && <div className="text-[10px] text-slate-400">+{tasks.length - 3}</div>}
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  )
}

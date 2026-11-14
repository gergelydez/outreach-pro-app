'use client'

import Link from 'next/link'
import { useApi, gbp, relative, dateUk } from '@/lib/crm/client'
import { PageHeader, Card, Kpi, ScoreBadge, WebsiteBadge, Empty, ApiErrorNotice, Skeleton, ButtonLink, Badge } from '@/components/crm/ui'
import { ColumnChart, BarList, Progress } from '@/components/crm/charts'
import { STAGES, stageLabel, categoryLabel } from '@/lib/crm/constants'

interface Dash {
  kpis: Record<string, number>; daily_target: number; daily: { day: string; n: number }[]
  stages: { stage: string; n: number; value: number }[]
  top: { id: string; name: string; city: string; category: string; website_status: string; opportunity_score: number; stage: string }[]
  activity: { id: string; type: string; summary: string; created_at: string; business_id: string | null; business_name: string | null }[]
  tasks: { id: string; title: string; due_at: string; priority: string; business_id: string | null; business_name: string | null }[]
  jobs: Record<string, number>
}

export default function DashboardPage() {
  const { data, error, loading, reload } = useApi<Dash>('/api/crm/dashboard')
  const k = data?.kpis

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your UK prospecting and sales activity, from live CRM data."
        actions={<><ButtonLink href="/crm/hunter" variant="primary">Discover businesses</ButtonLink></>} />
      {error ? <ApiErrorNotice error={error} onRetry={reload} /> : loading || !data || !k ? <Skeleton rows={8} /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <Kpi label="Total leads" value={k.total} />
            <Kpi label="New today" value={k.today} hint={<span>target {data.daily_target}</span>} />
            <Kpi label="Qualified" value={k.qualified} />
            <Kpi label="High opportunity" value={k.high} hint="score ≥ 60" />
            <Kpi label="Contacted" value={k.contacted} />
            <Kpi label="Replies" value={k.replies} />
            <Kpi label="Calls / meetings" value={k.meetings} />
            <Kpi label="Won deals" value={k.won} />
            <Kpi label="Pipeline value" value={gbp(k.pipeline_value)} />
            <Kpi label="Revenue won" value={gbp(k.revenue)} emphasis />
          </div>

          {k.total === 0 && (
            <Card><Empty title="No leads yet" action={<ButtonLink href="/crm/hunter" variant="primary">Open Business Hunter</ButtonLink>}>
              Start by discovering plumbers and electricians in Birmingham. If this is your first visit, check <Link href="/crm/settings" className="text-teal-700 underline">Settings & API</Link> first.
            </Empty></Card>
          )}

          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="New leads — last 30 days" className="lg:col-span-2"
              action={<div className="w-40"><div className="text-[11px] text-slate-500 text-right mb-1">Today {k.today}/{data.daily_target}</div><Progress value={k.today} max={data.daily_target} /></div>}>
              <ColumnChart data={data.daily.map(d => ({ label: dateUk(d.day).slice(0, 6), value: d.n }))} target={data.daily_target} />
            </Card>
            <Card title="Pipeline" action={<Link href="/crm/pipeline" className="text-xs text-teal-700 font-medium">Open board →</Link>}>
              <BarList data={STAGES.map(s => ({ key: s.key, n: data.stages.find(x => x.stage === s.key)?.n || 0 })).filter(s => s.n > 0)} labelFor={stageLabel} />
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Top opportunities" className="lg:col-span-2" pad={false} action={<Link href="/crm/leads?sort=score" className="text-xs text-teal-700 font-medium">All leads →</Link>}>
              {data.top.length === 0 ? <Empty title="No scored leads yet">Scores appear after the website audit worker has checked each business.</Empty> : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.top.map(t => (
                      <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2.5"><Link href={`/crm/leads/${t.id}`} className="font-medium text-slate-900 hover:text-teal-700">{t.name}</Link>
                          <div className="text-xs text-slate-500">{categoryLabel(t.category)} · {t.city}</div></td>
                        <td className="px-2"><WebsiteBadge status={t.website_status} /></td>
                        <td className="px-2 hidden sm:table-cell text-xs text-slate-500">{stageLabel(t.stage)}</td>
                        <td className="px-4 text-right"><ScoreBadge score={t.opportunity_score} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card title="Today's tasks" action={<Link href="/crm/followups" className="text-xs text-teal-700 font-medium">Follow-ups →</Link>}>
              {data.tasks.length === 0 ? <p className="text-sm text-slate-500 py-3">Nothing due today.</p> : (
                <ul className="space-y-2">
                  {data.tasks.map(t => (
                    <li key={t.id} className="flex items-start gap-2 text-sm">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${new Date(t.due_at) < new Date(new Date().toDateString()) ? 'bg-rose-500' : 'bg-amber-500'}`} />
                      <div className="min-w-0">
                        <div className="text-slate-800 truncate">{t.title}</div>
                        <div className="text-xs text-slate-500">{relative(t.due_at)}{t.business_id && <> · <Link className="text-teal-700" href={`/crm/leads/${t.business_id}`}>{t.business_name}</Link></>}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {(data.jobs.pending || data.jobs.running || data.jobs.dead) ? (
                <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap gap-2">
                  Audit queue: <Badge>{data.jobs.pending || 0} pending</Badge><Badge tone="info">{data.jobs.running || 0} running</Badge>{data.jobs.dead ? <Badge tone="bad">{data.jobs.dead} failed</Badge> : null}
                </div>
              ) : null}
            </Card>
          </div>

          <Card title="Recent activity">
            {data.activity.length === 0 ? <p className="text-sm text-slate-500 py-3">No activity yet.</p> : (
              <ul className="divide-y divide-slate-100">
                {data.activity.map(a => (
                  <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-700 min-w-0 truncate">
                      {a.business_id ? <Link className="font-medium text-slate-900 hover:text-teal-700" href={`/crm/leads/${a.business_id}`}>{a.business_name}</Link> : null}
                      {a.business_id ? ' — ' : ''}{a.summary}
                    </span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{relative(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  )
}

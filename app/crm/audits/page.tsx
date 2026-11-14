'use client'

import Link from 'next/link'
import { useState } from 'react'
import { api, useApi, relative } from '@/lib/crm/client'
import { PageHeader, Card, Badge, WebsiteBadge, ApiErrorNotice, Skeleton, Empty, Kpi, Button, Toast, Select } from '@/components/crm/ui'
import { BarList } from '@/components/crm/charts'
import { WEBSITE_STATUS_LABEL } from '@/lib/crm/constants'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AuditsPage() {
  const audits = useApi<any>('/api/crm/audits')
  const [jobFilter, setJobFilter] = useState('')
  const jobs = useApi<any>(`/api/crm/jobs${jobFilter ? `?status=${jobFilter}` : ''}`)
  const [toast, setToast] = useState<string | null>(null)
  const c = jobs.data?.counts || {}
  const lastSeen = jobs.data?.workers?.[0]?.last_seen
  const workerAlive = lastSeen && Date.now() - new Date(lastSeen).getTime() < 15 * 60_000

  async function act(id: string, action: string) {
    try { await api(`/api/crm/jobs/${id}`, { json: { action } }); setToast(action === 'retry' ? 'Job queued again' : 'Job cancelled'); jobs.reload() }
    catch (e) { setToast(e instanceof Error ? e.message : 'Failed') }
  }

  return (
    <>
      <PageHeader title="Website Audits" subtitle="Audits run in the Python worker (outside the web app). Results, PageSpeed scores and the job queue are shown here."
        actions={<Button onClick={() => { audits.reload(); jobs.reload() }}>Refresh</Button>} />
      {(audits.error || jobs.error) && <ApiErrorNotice error={(audits.error || jobs.error)!} />}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <Kpi label="Pending" value={c.pending || 0} /><Kpi label="Running" value={c.running || 0} /><Kpi label="Done" value={c.done || 0} />
        <Kpi label="Failed (dead)" value={c.dead || 0} /><Kpi label="Worker" value={workerAlive ? 'Online' : lastSeen ? 'Idle' : 'Not seen'} hint={lastSeen ? `last job ${relative(lastSeen)}` : 'start the Python worker'} emphasis={!workerAlive} />
      </div>
      {!lastSeen && (c.pending || 0) > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <b>{c.pending} audit job(s) are waiting, but no worker has picked up a job yet.</b> Start the worker (see <code>worker/README.md</code>): it needs <code>CRM_API_URL</code> and <code>CRM_WORKER_TOKEN</code>.
        </div>
      )}

      <div className="grid xl:grid-cols-[1fr_320px] gap-4 items-start">
        <Card title="Latest audits" pad={false}>
          {audits.loading ? <div className="p-4"><Skeleton /></div> : !audits.data?.audits.length ? <Empty title="No audits yet">New leads are queued automatically after discovery.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200"><tr>
                  <th className="text-left px-4 py-2 font-medium">Business</th><th className="text-left px-2 font-medium">Result</th><th className="text-left px-2 font-medium">PageSpeed</th><th className="text-left px-2 font-medium">Findings</th><th className="text-left px-4 font-medium">When</th>
                </tr></thead>
                <tbody>
                  {audits.data.audits.map((a: any) => (
                    <tr key={a.id} className="border-b border-slate-100">
                      <td className="px-4 py-2"><Link href={`/crm/leads/${a.business_id}`} className="font-medium text-slate-900 hover:text-teal-700">{a.business_name}</Link><div className="text-[11px] text-slate-500 truncate max-w-[240px]">{a.final_url || a.url || 'no website listed'}</div></td>
                      <td className="px-2"><WebsiteBadge status={a.website_status} />{a.error && <div className="text-[11px] text-rose-700 mt-0.5">{a.error}</div>}</td>
                      <td className="px-2 tabular-nums">{a.performance ?? '—'}</td>
                      <td className="px-2 tabular-nums">{a.findings_count}</td>
                      <td className="px-4 text-slate-500 whitespace-nowrap">{relative(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Website status (all leads)">
          <BarList data={audits.data?.statuses || []} labelFor={k => WEBSITE_STATUS_LABEL[k] || k} />
        </Card>
      </div>

      <Card title="Job queue" className="mt-4" action={<Select className="h-8 w-36 text-xs" value={jobFilter} onChange={e => setJobFilter(e.target.value)}><option value="">All</option>{['pending', 'running', 'done', 'dead', 'cancelled'].map(s => <option key={s}>{s}</option>)}</Select>} pad={false}>
        {!jobs.data?.jobs.length ? <Empty title="No jobs" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <tbody>
                {jobs.data.jobs.map((j: any) => (
                  <tr key={j.id} className="border-b border-slate-100">
                    <td className="px-4 py-2">{j.business_id ? <Link href={`/crm/leads/${j.business_id}`} className="text-slate-800 hover:text-teal-700">{j.business_name}</Link> : '—'}</td>
                    <td className="px-2"><Badge tone={j.status === 'done' ? 'good' : j.status === 'dead' ? 'bad' : j.status === 'running' ? 'info' : 'neutral'}>{j.status}</Badge></td>
                    <td className="px-2 text-xs text-slate-500">attempt {j.attempts}/{j.max_attempts}</td>
                    <td className="px-2 text-xs text-rose-700 max-w-[280px] truncate" title={j.last_error || ''}>{j.last_error}</td>
                    <td className="px-2 text-xs text-slate-500 whitespace-nowrap">{j.status === 'pending' ? `runs ${relative(j.run_after)}` : relative(j.updated_at)}</td>
                    <td className="px-4 text-right whitespace-nowrap">
                      {['dead', 'cancelled', 'done'].includes(j.status) && <button className="text-xs text-teal-700 mr-3" onClick={() => act(j.id, 'retry')}>Retry</button>}
                      {['pending', 'dead'].includes(j.status) && <button className="text-xs text-slate-500" onClick={() => act(j.id, 'cancel')}>Cancel</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  )
}

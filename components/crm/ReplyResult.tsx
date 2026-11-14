'use client'

// Rezultatul asistentului de răspuns: traducere în română, intenția clientului,
// răspuns sugerat în engleză britanică + traducerea lui.
import { Badge } from './ui'

/* eslint-disable @typescript-eslint/no-explicit-any */
const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => {})

export default function ReplyResult({ r, say }: { r: any; say: (m: string) => void }) {
  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-2"><Badge tone="info">Intent: {r.intent}</Badge>{r.objection_type !== 'none' && <Badge tone="warn">Objection: {r.objection_type.replace(/_/g, ' ')}</Badge>}</div>
      <div><div className="text-[11px] uppercase text-slate-400">Traducere</div><p className="text-slate-700">{r.translation_ro}</p></div>
      <div><div className="text-[11px] uppercase text-slate-400">Ce vrea clientul</div><p className="text-slate-700">{r.intent_explained_ro}</p></div>
      <div><div className="flex justify-between"><span className="text-[11px] uppercase text-slate-400">Suggested reply (EN)</span><button className="text-xs text-teal-700" onClick={() => { copy(r.suggested_reply_en); say('Copied') }}>Copy</button></div>
        <pre className="whitespace-pre-wrap font-sans text-[13px] bg-slate-50 rounded-md p-3">{r.suggested_reply_en}</pre></div>
      <div><div className="text-[11px] uppercase text-slate-400">Răspunsul sugerat, în română</div><p className="text-slate-600 italic">{r.suggested_reply_ro}</p></div>
      <div className="text-xs text-slate-500">Next step: {r.next_step}</div>
    </div>
  )
}


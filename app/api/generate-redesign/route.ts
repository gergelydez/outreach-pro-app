import { NextRequest } from 'next/server'
import { putFile, getText, r2Configured } from '@/lib/object-store'
import { waitUntil } from '@vercel/functions'
import { randomBytes } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { friendlyAnthropicError } from '@/lib/anthropic-error'
import type { RebuildLead } from '@/lib/rebuild'
import { buildRedesignPrompt, generateHtml } from '@/lib/redesign'

// Generarea unui site complet durează 1-4 minute
export const maxDuration = 300

// Cu Blob configurat, generarea rulează ca JOB pe server (waitUntil): POST întoarce
// imediat {jobId}, iar rezultatul e salvat în Blob la jobs/<id>/done.json sau
// error.json. Clientul îl preia cu GET ?job=<id> — deci generarea continuă și
// dacă închizi fereastra, blochezi telefonul sau reîncarci pagina.
// Fără Blob: răspuns NDJSON în flux ({t:'progress'|'done'|'error'}), legat de conexiune.

export async function POST(req: NextRequest) {
  const { lead, anthropicApiKey: clientKey, googleApiKey, extraInstructions = '', language }:
    { lead: RebuildLead; anthropicApiKey?: string; googleApiKey?: string; extraInstructions?: string; language?: 'en' | 'hu' } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY || clientKey
  if (!apiKey) return Response.json({ error: 'Lipsă Anthropic API key (Setări)' }, { status: 400 })
  if (!lead.audit) return Response.json({ error: 'Rulează mai întâi auditul site-ului' }, { status: 400 })

  const prompt = await buildRedesignPrompt(lead, { googleApiKey, origin: req.nextUrl.origin, language, extraInstructions })

  const client = new Anthropic({ apiKey })
  const keySource = process.env.ANTHROPIC_API_KEY ? 'env' : 'settings'

  if (blobConfigured()) {
    const jobId = randomBytes(8).toString('hex')
    waitUntil((async () => {
      try {
        const html = await generateHtml(client, prompt)
        await putJob(jobId, 'done', { html })
      } catch (err) {
        await putJob(jobId, 'error', { error: friendlyAnthropicError(err, keySource) }).catch(() => {})
      }
    })())
    return Response.json({ jobId })
  }

  const encoder = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      try {
        const html = await generateHtml(client, prompt, chars => send({ t: 'progress', chars }))
        send({ t: 'done', html })
      } catch (err) {
        send({ t: 'error', error: friendlyAnthropicError(err, keySource) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// GET ?job=<id> → {status:'running'} | {status:'done', html} | {status:'error', error}
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('job') || ''
  if (!/^[a-f0-9]{16}$/.test(jobId)) return Response.json({ error: 'job invalid' }, { status: 400 })
  for (const status of ['done', 'error'] as const) {
    try {
      const text = await getText(`jobs/${jobId}/${status}.json`)
      if (text == null) continue
      const data = JSON.parse(text)
      return Response.json({ status, ...data }, { headers: { 'Cache-Control': 'no-store' } })
    } catch {}
  }
  return Response.json({ status: 'running' }, { headers: { 'Cache-Control': 'no-store' } })
}

function blobConfigured() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) || r2Configured()
}

// Fiecare rezultat e scris o singură dată, la o cale proprie — fără suprascrieri,
// deci nu citim niciodată o versiune veche din cache-ul CDN al Blob.
async function putJob(jobId: string, status: 'done' | 'error', data: object) {
  await putFile(`jobs/${jobId}/${status}.json`, JSON.stringify(data), { contentType: 'application/json' })
}

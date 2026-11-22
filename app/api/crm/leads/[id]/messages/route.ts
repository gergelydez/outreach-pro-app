import { route, json, requireUuid } from '@/lib/crm/api'
import { one } from '@/lib/crm/db'
import { listSiteMessages } from '@/lib/crm/site-messages'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

// Mesajele din formularul site-ului + unde ajung pe email (pentru cardul firmei din CRM)
export const GET = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const id = requireUuid(params.id)
  const b = await one<{ email: string | null }>('SELECT email FROM businesses WHERE id = $1', [id])
  const acc = await one<{ notify_email: string | null }>('SELECT notify_email FROM client_accounts WHERE business_id = $1', [id])
  const portalEmail = acc?.notify_email || ''
  return json({
    recipient: portalEmail || b?.email || '',
    fromPanel: !!portalEmail,
    emailReady: !!process.env.RESEND_API_KEY && !!process.env.FORM_FROM_EMAIL,
    messages: await listSiteMessages(id, 20),
  })
})

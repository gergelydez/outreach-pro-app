import { clearCookie } from '@/lib/crm/client-auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookie() } })
}

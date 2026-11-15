import { route, json, body, str, int, HttpError } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'
import { runDiscovery, newLeadsToday } from '@/lib/crm/discovery'
import { getSettings } from '@/lib/crm/settings'
import { placesKey } from '@/lib/crm/providers/google-places'
import { asCountry } from '@/lib/crm/countries'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// O rulare = un oraș + o categorie (max 60 rezultate de la Google). Interfața trimite
// rulările una câte una, ca fiecare cerere să rămână scurtă.
export const POST = route(async (req: Request) => {
  const b = await body<Record<string, unknown>>(req)
  const clientKey = str(b.google_api_key, 200)
  if (!placesKey(clientKey)) throw new HttpError(503, 'No Google Places key: add it in the app Settings page (same as the Romanian tools) or as GOOGLE_PLACES_API_KEY in Vercel.')
  const city = str(b.city, 80), category = str(b.category, 60)
  if (!city || !category) throw new HttpError(400, 'city and category are required')
  const wf = str(b.website_filter, 20)
  const result = await runDiscovery({
    city, category, region: str(b.region, 80),
    limit: int(b.limit, 25, 1, 60),
    minRating: b.min_rating != null && b.min_rating !== '' ? Number(b.min_rating) : null,
    minReviews: b.min_reviews != null && b.min_reviews !== '' ? int(b.min_reviews, 0, 0, 100000) : null,
    websiteFilter: wf === 'no_website' || wf === 'has_website' ? wf : 'any',
    country: asCountry(b.country),
  }, undefined, { apiKey: clientKey })
  return json(result, result.stoppedReason === 'error' ? 502 : 200)
})

export const GET = route(async () => {
  const settings = await getSettings()
  const jobs = await q(`SELECT * FROM discovery_jobs ORDER BY created_at DESC LIMIT 30`)
  return json({ jobs, today: await newLeadsToday(), daily_target: settings.target_market.daily_target, daily_max: settings.limits.daily_discovery_max, configured: !!placesKey(), server_key: !!placesKey() })
})

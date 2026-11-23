import { route, json, body, str, int, HttpError } from '@/lib/crm/api'
import { areaStep, areaPlan } from '@/lib/crm/area-hunt'
import { asCountry } from '@/lib/crm/countries'
import { placesKey } from '@/lib/crm/providers/google-places'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Câte căutări are zona (pentru bara de progres)
export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const plan = areaPlan(asCountry(sp.get('country')), str(sp.get('region'), 80) || '', str(sp.get('city'), 80), str(sp.get('category'), 60))
  return json({ total: plan.total, cities: plan.cities.length, categories: plan.categories.length })
})

// Un pas din căutarea pe zonă: un oraș × o meserie
export const POST = route(async (req: Request) => {
  const b = await body<Record<string, unknown>>(req)
  const apiKey = str(b.google_api_key, 200)
  if (!placesKey(apiKey)) throw new HttpError(503, 'No Google Places key: add it in the app Settings page or as GOOGLE_PLACES_API_KEY in Vercel.')
  const region = str(b.region, 80)
  if (!region) throw new HttpError(400, 'Alege județul / zona.')
  const r = await areaStep({ country: asCountry(b.country), region, city: str(b.city, 80), category: str(b.category, 60), cursor: int(b.cursor, 0, 0, 100000), apiKey })
  return json(r)
})

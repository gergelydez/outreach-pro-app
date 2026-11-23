import { describe, it, expect } from 'vitest'
import { areaPlan, areaStepAt } from '@/lib/crm/area-hunt'
import { RO_REGIONS } from '@/lib/crm/countries'

describe('area hunt plan', () => {
  it('whole county × all trades, city by city', () => {
    const plan = areaPlan('RO', 'Brașov')
    expect(plan.cities.map(c => c.city)).toEqual(RO_REGIONS['Brașov'])
    expect(plan.total).toBe(plan.cities.length * plan.categories.length)
    const first = areaStepAt(plan, 0)!, second = areaStepAt(plan, 1)!, nextCity = areaStepAt(plan, plan.categories.length)!
    expect(first.city).toBe(second.city)
    expect(nextCity.city).toBe(plan.cities[1].city)
    expect(areaStepAt(plan, plan.total)).toBeNull()
  })
  it('one town and one trade is a single search', () => {
    const plan = areaPlan('RO', 'Brașov', 'Râșnov', 'pension')
    expect(plan.total).toBe(1)
    expect(areaStepAt(plan, 0)).toEqual({ city: 'Râșnov', region: 'Brașov', category: 'pension' })
  })
  it('unknown trade or town gives nothing to search', () => {
    expect(areaPlan('RO', 'Brașov', 'Nicăieri').total).toBe(0)
    expect(areaPlan('RO', 'Brașov', null, 'xyz').total).toBe(0)
  })
})

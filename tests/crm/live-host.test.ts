import { describe, it, expect, afterEach } from 'vitest'
import { isAppHost, hostOfUrl, normHost } from '@/lib/live-host'

describe('live host', () => {
  afterEach(() => { delete process.env.PUBLIC_APP_URL; delete process.env.APP_HOSTS })
  it('keeps the app on its own hosts', () => {
    process.env.PUBLIC_APP_URL = 'https://panou.glamx.ro'
    expect(isAppHost('outreach-pro-app.vercel.app')).toBe(true)
    expect(isAppHost('localhost:3000')).toBe(true)
    expect(isAppHost('panou.glamx.ro')).toBe(true)
    expect(isAppHost('hanulizvorulrece.ro')).toBe(false)
    expect(isAppHost('www.hanulizvorulrece.ro')).toBe(false)
  })
  it('extra app hosts via APP_HOSTS', () => {
    process.env.APP_HOSTS = 'crm.example.com, https://app.example.org'
    expect(isAppHost('crm.example.com')).toBe(true)
    expect(isAppHost('app.example.org')).toBe(true)
  })
  it('matches www and bare domain to the saved live url', () => {
    expect(hostOfUrl('https://hanulizvorulrece.ro/')).toBe('hanulizvorulrece.ro')
    expect(hostOfUrl('www.hanulizvorulrece.ro')).toBe('hanulizvorulrece.ro')
    expect(normHost('WWW.Hanulizvorulrece.ro:443')).toBe('hanulizvorulrece.ro')
  })
})

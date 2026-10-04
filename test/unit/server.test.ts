import { describe, expect, it } from 'vitest'
import { RecordThrottle, TtlCache, decisionKey, gatewayHeaders, marketOf, resolveCredentials, sanitizeRecord, serverConfig } from '../../src/runtime/server/shared'

const config = { apiUrl: 'https://api.revenexx.com', tenant: 'acme', apiKey: 'rvxk_local' }

describe('gateway credentials', () => {
  it('prefers the brokered context of a deployed Site', () => {
    const c = resolveCredentials({ 'x-revenexx-tenant': 'shop-a', 'x-revenexx-context': 'jwt.token.sig' }, config)
    expect(c).toEqual({ tenant: 'shop-a', apiKey: '', jwt: 'jwt.token.sig', source: 'brokered' })
    expect(gatewayHeaders(c, 'de')).toMatchObject({ 'authorization': 'Bearer jwt.token.sig', 'x-revenexx-tenant': 'shop-a', 'x-revenexx-market': 'de' })
  })

  it('never pairs a brokered tenant with another tenant\'s key', () => {
    expect(resolveCredentials({ 'x-revenexx-tenant': 'shop-b' }, config).apiKey).toBe('')
    expect(resolveCredentials({ 'x-revenexx-tenant': 'acme' }, config).apiKey).toBe('rvxk_local')
  })

  it('falls back to the configured tenant and key', () => {
    const c = resolveCredentials({}, config)
    expect(c.source).toBe('config')
    const headers = gatewayHeaders(c, '')
    expect(headers['x-revenexx-api-key']).toBe('rvxk_local')
    expect(headers['x-revenexx-market']).toBeUndefined()
    expect(Object.keys(headers).some(h => /forwarded|real-ip|user-agent/i.test(h))).toBe(false)
  })

  it('takes the market from the header, else from the market cookie', () => {
    expect(marketOf({ 'x-revenexx-market': 'at' }, 'de')).toBe('at')
    expect(marketOf({}, 'de')).toBe('de')
    expect(marketOf({}, 'de; drop table')).toBe('')
  })
})

describe('the record route', () => {
  const body = {
    consent_id: '0f8fad5b-d9cb-469f-a165-70867728950e',
    policy_version_id: '5d1e6c2a-7c51-4b8e-9a8f-1f0c1d2e3f40',
    action: 'custom', surface: 'preferences', locale: 'de',
    decisions: { purposes: { statistics: 'granted' } },
    page_path: '/produkte?utm_source=mail#top',
    ip: '203.0.113.7', contact_id: 'someone', user_agent: 'Mozilla/5.0 Firefox/131.0',
  }

  it('forwards only the fields the app takes, without an address [@spec:module-contract:AC-7]', () => {
    const out = sanitizeRecord(body, 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')!
    expect(out).not.toHaveProperty('ip')
    expect(out).not.toHaveProperty('contact_id')
    expect(out).not.toHaveProperty('user_agent')
    expect(out.page_path).toBe('/produkte')
    expect(out.user_agent_class).toBe('Firefox 131')
    expect(JSON.stringify(out)).not.toContain('203.0.113.7')
    expect(sanitizeRecord({ ...body, consent_id: 'x' })).toBeNull()
  })

  it('takes one record per consent id and second, and collapses identical decisions [@spec:module-contract:AC-8]', () => {
    const throttle = new RecordThrottle(1000)
    const a = decisionKey(body)
    const b = decisionKey({ ...body, action: 'accept_all' })
    expect(throttle.check(body.consent_id, a, 0)).toBe('ok')
    throttle.remember(body.consent_id, a, 0)
    expect(throttle.check(body.consent_id, a, 5000)).toBe('duplicate')
    expect(throttle.check(body.consent_id, b, 500)).toBe('rate_limited')
    expect(throttle.check(body.consent_id, b, 1500)).toBe('ok')
    expect(decisionKey({ ...body, decisions: { purposes: { statistics: 'granted' } } })).toBe(a)
  })

  it('shares one policy fetch per window and does not cache failures', async () => {
    const cache = new TtlCache<number>(60_000)
    let calls = 0
    const load = async () => ++calls
    await cache.get('acme:de', load, 0)
    await cache.get('acme:de', load, 30_000)
    expect(calls).toBe(1)
    await cache.get('acme:de', load, 61_000)
    expect(calls).toBe(2)
    await expect(cache.get('x', async () => { throw new Error('down') }, 0)).rejects.toThrow()
    await new Promise(r => setTimeout(r, 0))
    expect(await cache.get('x', async () => 7, 1)).toBe(7)
  })
})

describe('runtime gateway settings', () => {
  it('reads the module config first, then the shop-wide variables, at request time [@spec:module-contract:AC-12]', () => {
    const env = { NUXT_REVENEXX_API_URL: 'https://gw.example', NUXT_REVENEXX_TENANT: 'shop', NUXT_REVENEXX_API_KEY: 'rvxk_shop' }
    expect(serverConfig({ apiUrl: '', tenant: '', apiKey: '' }, env)).toEqual({ apiUrl: 'https://gw.example', tenant: 'shop', apiKey: 'rvxk_shop' })
    expect(serverConfig({ apiUrl: '', tenant: 'acme', apiKey: 'rvxk_acme' }, env)).toMatchObject({ tenant: 'acme', apiKey: 'rvxk_acme' })
    expect(serverConfig(undefined, {})).toEqual({ apiUrl: 'https://api.revenexx.com', tenant: '', apiKey: '' })
  })
})

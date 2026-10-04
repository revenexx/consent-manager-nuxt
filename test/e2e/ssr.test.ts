import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { encodeConsentCookie } from '../../src/runtime/core'
import { makePolicy } from '../fixtures/policy'

/**
 * Server-rendered HTML, built from a real Nuxt fixture against a stand-in
 * gateway. What a crawler or a visitor without JavaScript receives is what is
 * asserted here — the first HTML has to be clean on its own.
 */
const policy = makePolicy()
const records: unknown[] = []
const gateway = createServer((req, res) => {
  if (req.url?.startsWith('/v1/consent-manager/delivery/policy')) {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(policy))
    return
  }
  if (req.url === '/v1/consent-manager/records' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      records.push({ body: JSON.parse(body), headers: req.headers })
      res.writeHead(201, { 'content-type': 'application/json' }).end('{}')
    })
    return
  }
  res.writeHead(404).end()
})
await new Promise<void>(resolve => gateway.listen(0, '127.0.0.1', resolve))
process.env.NUXT_CONSENT_MANAGER_API_URL = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`
afterAll(() => { gateway.close() })

await setup({ rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)) })

const VENDOR_HOSTS = policy.vendors.flatMap(v => v.hosts)

/**
 * Whether the markup would make the browser contact a host: an src, href,
 * srcset or poster pointing at it. The policy itself — host names as data in
 * the payload — makes no request and is not counted.
 */
function requests(html: string, host: string): boolean {
  const markup = html.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '')
  return new RegExp(`(?:src|href|srcset|poster|action)=["'][^"']*${host.replace(/\./g, '\\.')}`).test(markup)
}
const granted = encodeConsentCookie({ id: '0f8fad5b-d9cb-469f-a165-70867728950e', v: 3, p: { statistics: 'g', external_media: 'g', marketing: 'd', necessary: 'g' }, x: {}, t: Math.floor(Date.now() / 1000) })

describe('server-rendered HTML', () => {
  it('holds no consent-based vendor before a decision, and the banner [@spec:module-contract:AC-1]', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('data-consent-banner')
    expect(html).toContain('Alle ablehnen')
    for (const host of VENDOR_HOSTS) expect(requests(html, host), host).toBe(false)
    expect(html).not.toMatch(/<iframe/)
  })

  it('writes the Consent Mode default as the first data layer entry in the head [@spec:module-contract:AC-2]', async () => {
    const html = await $fetch<string>('/')
    const head = html.slice(0, html.indexOf('</head>'))
    const scripts = [...head.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    const first = scripts.findIndex(m => /dataLayer|gtag/.test(m[0]))
    expect(first).toBeGreaterThanOrEqual(0)
    expect(scripts[first]![1]).toContain(`gtag('consent','default'`)
    const consentAt = head.indexOf(`gtag('consent','default'`)
    const tagAt = head.indexOf('/some-tag.js')
    expect(tagAt).toBeGreaterThan(-1)
    expect(consentAt).toBeLessThan(tagAt)
    expect(head).not.toContain(`gtag('consent','update'`)
  })

  it('renders a returning visitor without the banner, with the update and the embed', async () => {
    const html = await $fetch<string>('/', { headers: { cookie: `rvx_consent=${granted}` } })
    expect(html).not.toContain('data-consent-banner')
    expect(html).toContain(`gtag('consent','update'`)
    expect(html).toContain('"analytics_storage":"granted"')
    expect(html).toContain('www.youtube-nocookie.com/embed')
  })

  it('keeps a gated embed as a local placeholder until its vendor is allowed [@spec:module-contract:AC-5]', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('data-consent-gate="youtube"')
    expect(html).toContain('Einmal laden')
    for (const host of policy.vendors.find(v => v.code === 'youtube')!.hosts) expect(requests(html, host), host).toBe(false)
    expect(html).not.toMatch(/<iframe/)
  })

  it('renders the exempt-path layout from the requested route, as the browser will', async () => {
    const exempt = await $fetch<string>('/datenschutz')
    expect(exempt).toMatch(/class="[^"]*rvx-consent--bar[^"]*rvx-consent--exempt/)
    const normal = await $fetch<string>('/produkte')
    expect(normal).toContain('rvx-consent--box')
    expect(normal).not.toContain('rvx-consent--exempt')
  })

  it('shows no banner and no optional script on editor hosts and paths [@spec:module-contract:AC-6]', async () => {
    for (const [path, headers] of [['/', { 'x-forwarded-host': 'acme.theme.rvnxx.site' }], ['/admin/pages', {}], ['/preview/home', {}]] as const) {
      const html = await $fetch<string>(path, { headers: { ...headers, cookie: `rvx_consent=${granted}` } })
      expect(html, path).not.toContain('data-consent-banner')
      expect(html, path).not.toContain('data-consent-preferences-link')
      for (const host of VENDOR_HOSTS) expect(requests(html, host), `${path} ${host}`).toBe(false)
      expect(html, path).not.toContain(`gtag('consent','update'`)
    }
  })

  it('serves the policy and forwards a record without an address [@spec:module-contract:AC-7]', async () => {
    const answer = await $fetch<{ policy: { version: { number: number } } }>('/_consent-manager/policy')
    expect(answer.policy.version.number).toBe(3)
    const body = { consent_id: '1f8fad5b-d9cb-469f-a165-70867728950e', policy_version_id: policy.version.id, action: 'reject_all', surface: 'first_layer', locale: 'de', decisions: {}, ip: '203.0.113.7', page_path: '/x?gclid=1' }
    const res = await fetch('/_consent-manager/record', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0 Firefox/131.0' } })
    expect(res.status).toBe(200)
    const sent = records.at(-1) as { body: Record<string, unknown>, headers: Record<string, string> }
    expect(JSON.stringify(sent)).not.toContain('203.0.113.7')
    expect(sent.body.page_path).toBe('/x')
    expect(sent.headers['x-revenexx-api-key']).toBe('rvxk_fixture')
    const big = await fetch('/_consent-manager/record', { method: 'POST', body: JSON.stringify({ ...body, page_path: 'x'.repeat(5000) }), headers: { 'content-type': 'application/json' } })
    expect(big.status).toBe(413)
  })
})

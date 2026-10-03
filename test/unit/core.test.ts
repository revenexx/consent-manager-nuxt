import { describe, expect, it } from 'vitest'
import {
  allows, consentModeDefault, decide, decodeConsentCookie, encodeConsentCookie, googleSignals, isEditorContext,
  isExemptPath, needsDecision, stateOf, userAgentClass,
} from '../../src/runtime/core'
import { makePolicy } from '../fixtures/policy'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const NOW = Date.parse('2026-10-03T10:00:00Z')
const T = Math.floor(NOW / 1000)

describe('the rvx_consent cookie', () => {
  it('round-trips the contract shape as base64url JSON', () => {
    const cookie = { id: ID, v: 3, p: { statistics: 'g' as const, marketing: 'd' as const }, x: { youtube: 'g' as const, etracker: 'o' as const }, t: T }
    const raw = encodeConsentCookie(cookie)
    expect(raw).toMatch(/^[\w-]+$/)
    expect(JSON.parse(Buffer.from(raw, 'base64url').toString())).toEqual(cookie)
    expect(decodeConsentCookie(raw)).toEqual(cookie)
  })

  it('reads anything that is not exactly the contract shape as no cookie', () => {
    for (const bad of ['', 'not-base64!', Buffer.from('{"id":"x","v":1,"p":{},"x":{},"t":1}').toString('base64url'), Buffer.from(JSON.stringify({ id: ID, v: 1, p: { a: 'yes' }, x: {}, t: 1 })).toString('base64url')]) {
      expect(decodeConsentCookie(bad)).toBeNull()
    }
  })
})

describe('the gating rule', () => {
  const policy = makePolicy()
  const cookie = (p: Record<string, 'g' | 'd' | 'o'>, x: Record<string, 'g' | 'd' | 'o'> = {}, v = 3) => ({ id: ID, v, p, x, t: T })

  it('before a decision only necessary and objectable vendors may load [@spec:module-contract:AC-1]', () => {
    expect(allows(policy, null, 'etracker', 'statistics', false, NOW)).toBe(true)
    expect(allows(policy, null, 'google-analytics', 'statistics', false, NOW)).toBe(false)
    expect(allows(policy, null, 'youtube', 'external_media', false, NOW)).toBe(false)
  })

  it('consent needs the purpose or the vendor granted', () => {
    expect(allows(policy, cookie({ statistics: 'g' }), 'google-analytics', 'statistics', false, NOW)).toBe(true)
    expect(allows(policy, cookie({ statistics: 'd' }), 'google-analytics', 'statistics', false, NOW)).toBe(false)
    expect(allows(policy, cookie({}, { youtube: 'g' }), 'youtube', 'external_media', false, NOW)).toBe(true)
  })

  it('legitimate interest runs until the vendor or the purpose is objected to', () => {
    expect(allows(policy, cookie({ statistics: 'd' }), 'etracker', 'statistics', false, NOW)).toBe(true)
    expect(allows(policy, cookie({}, { etracker: 'o' }), 'etracker', 'statistics', false, NOW)).toBe(false)
    expect(allows(policy, cookie({ statistics: 'o' }), 'etracker', 'statistics', false, NOW)).toBe(false)
  })

  it('fails closed on every uncertainty', () => {
    const granted = cookie({ statistics: 'g' })
    expect(allows(null, granted, 'google-analytics', 'statistics', false, NOW)).toBe(false)
    expect(allows(policy, granted, 'hotjar', 'statistics', false, NOW)).toBe(false)
    expect(allows(policy, granted, 'google-analytics', 'marketing', false, NOW)).toBe(false)
    expect(allows(policy, granted, 'google-analytics', 'statistics', true, NOW)).toBe(false)
    // A decision under an older material version is no decision.
    expect(allows(policy, cookie({ statistics: 'g' }, {}, 2), 'google-analytics', 'statistics', false, NOW)).toBe(false)
  })

  it('editor and preview contexts never load optional vendors [@spec:module-contract:AC-6]', () => {
    expect(isEditorContext('acme.theme.rvnxx.site', '/')).toBe(true)
    expect(isEditorContext('shop.example', '/admin/pages')).toBe(true)
    expect(isEditorContext('shop.example', '/preview/x')).toBe(true)
    expect(isEditorContext('shop.example', '/administration')).toBe(false)
    expect(isEditorContext('theme.rvnxx.site', '/')).toBe(false)
    const all = cookie({ statistics: 'g', marketing: 'g', external_media: 'g' })
    for (const v of policy.vendors) for (const p of v.purposes) expect(allows(policy, all, v.code, p, true, NOW)).toBe(false)
    expect(needsDecision(policy, null, true, NOW)).toBe(false)
  })
})

describe('asking again', () => {
  it('asks when there is no cookie, when a material version followed, and when the decision expired', () => {
    const policy = makePolicy({ number: 5, material: false, material_number: 4 })
    expect(needsDecision(policy, null, false, NOW)).toBe(true)
    expect(needsDecision(policy, { id: ID, v: 3, p: {}, x: {}, t: T }, false, NOW)).toBe(true)
    expect(needsDecision(policy, { id: ID, v: 4, p: {}, x: {}, t: T }, false, NOW)).toBe(false)
    expect(needsDecision(policy, { id: ID, v: 5, p: {}, x: {}, t: T - 366 * 86400 }, false, NOW)).toBe(true)
  })
})

describe('Consent Mode v2', () => {
  it('defaults every signal to denied except security storage [@spec:module-contract:AC-2]', () => {
    const script = consentModeDefault('dataLayer')
    expect(script).toContain(`gtag('consent','default',`)
    const defaults = JSON.parse(/gtag\('consent','default',(\{[^}]*\})\)/.exec(script)![1]!)
    expect(defaults).toEqual({
      ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      functionality_storage: 'denied', personalization_storage: 'denied', security_storage: 'granted', wait_for_update: 500,
    })
    expect(script).toContain(`gtag('set','ads_data_redaction',true)`)
  })

  it('updates the signals of granted purposes only', () => {
    const policy = makePolicy()
    const signals = googleSignals(policy, { id: ID, v: 3, p: { statistics: 'g', marketing: 'd' }, x: {}, t: T }, false, NOW)
    expect(signals.analytics_storage).toBe('granted')
    expect(signals.ad_storage).toBe('denied')
    expect(signals.security_storage).toBe('granted')
  })
})

describe('deciding', () => {
  const policy = makePolicy()
  it('accept all grants every consent purpose and keeps no id out of the state', () => {
    const { cookie, decisions } = decide(policy, null, 'accept_all', {}, NOW)
    expect(cookie.p).toMatchObject({ statistics: 'g', marketing: 'g', necessary: 'g' })
    expect(cookie.v).toBe(3)
    expect(JSON.stringify(decisions)).not.toContain(cookie.id)
    expect(stateOf(policy, cookie, false, NOW).purposes.statistics).toBe('granted')
  })

  it('reject all denies consent purposes and objects to legitimate-interest vendors', () => {
    const { cookie } = decide(policy, null, 'reject_all', {}, NOW)
    expect(cookie.p.statistics).toBe('d')
    expect(cookie.x.etracker).toBe('o')
    expect(allows(policy, cookie, 'etracker', 'statistics', false, NOW)).toBe(false)
  })

  it('withdrawing mints a new consent id', () => {
    const first = decide(policy, null, 'accept_all', {}, NOW).cookie
    const again = decide(policy, first, 'custom', { purposes: { statistics: 'granted' } }, NOW).cookie
    const withdrawn = decide(policy, again, 'withdraw', {}, NOW).cookie
    expect(again.id).toBe(first.id)
    expect(withdrawn.id).not.toBe(first.id)
  })

  it('a vendor grant keeps every earlier decision', () => {
    const before = decide(policy, null, 'custom', { purposes: { statistics: 'granted' } }, NOW).cookie
    const after = decide(policy, before, 'vendor_grant', { vendors: { youtube: 'granted' } }, NOW).cookie
    expect(after.p.statistics).toBe('g')
    expect(after.x.youtube).toBe('g')
  })
})

describe('small helpers', () => {
  it('reduces a user agent to family and major version', () => {
    expect(userAgentClass('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox 131')
    expect(userAgentClass(undefined)).toBeNull()
  })
  it('knows the exempt paths', () => {
    expect(isExemptPath(makePolicy(), '/datenschutz')).toBe(true)
    expect(isExemptPath(makePolicy(), '/produkte')).toBe(false)
  })
})

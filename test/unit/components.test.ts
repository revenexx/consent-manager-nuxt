// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import ConsentBanner from '../../src/runtime/components/ConsentBanner.vue'
import ConsentGate from '../../src/runtime/components/ConsentGate.vue'
import ConsentPreferencesLink from '../../src/runtime/components/ConsentPreferencesLink.vue'
import { CONSENT_MANAGER, createConsentManager } from '../../src/runtime/manager'
import { decide, encodeConsentCookie } from '../../src/runtime/core'
import type { ConsentCookie, ConsentState, DeliveredPolicy } from '../../src/runtime/types'
import { makePolicy } from '../fixtures/policy'

function setup(options: { cookie?: ConsentCookie | null, editor?: boolean, policy?: DeliveredPolicy | null, path?: string, sendRecord?: (b: Record<string, unknown>) => Promise<void> } = {}) {
  const env = {
    writeCookie: vi.fn(),
    sendRecord: vi.fn(options.sendRecord ?? (async () => {})),
    path: () => options.path ?? '/produkte',
    gtag: vi.fn(),
    emit: vi.fn(),
    forget: vi.fn(),
    reload: vi.fn(),
    queue: vi.fn(),
  }
  const manager = createConsentManager({ policy: options.policy === undefined ? makePolicy() : options.policy, cookie: options.cookie ?? null, editor: options.editor ?? false, locale: 'de', env, userAgent: 'Mozilla/5.0 Firefox/131.0' })
  const global = { provide: { [CONSENT_MANAGER as symbol]: manager } }
  return { manager, env, global }
}

const decided = (choices: Parameters<typeof decide>[3], action: 'custom' | 'accept_all' = 'custom') => decide(makePolicy(), null, action, choices).cookie

describe('ConsentBanner', () => {
  it('puts reject all on the first layer, as prominent as accept all [@spec:module-contract:AC-3]', () => {
    for (const layout of ['box', 'bar', 'modal'] as const) {
      const { global } = setup()
      const wrapper = mount(ConsentBanner, { props: { layout, path: '/produkte' }, global })
      const reject = wrapper.get('[data-consent-action="reject_all"]')
      const accept = wrapper.get('[data-consent-action="accept_all"]')
      expect(reject.text()).toBe('Alle ablehnen')
      expect(accept.text()).toBe('Alle akzeptieren')
      expect(reject.element.tagName).toBe(accept.element.tagName)
      expect(reject.classes()).toEqual(accept.classes())
      expect(reject.element.parentElement).toBe(accept.element.parentElement)
      expect(wrapper.get('[data-consent-banner]').attributes('role')).toBe('dialog')
      expect(wrapper.get('[data-consent-banner]').attributes('aria-modal')).toBe(layout === 'modal' ? 'true' : 'false')
    }
  })

  it('shows as a bar that covers nothing on an exempt path', () => {
    const { global } = setup()
    const wrapper = mount(ConsentBanner, { props: { path: '/datenschutz' }, global })
    expect(wrapper.get('[data-consent-banner]').classes()).toContain('rvx-consent--bar')
  })

  it('records the decision and closes', async () => {
    const { global, env, manager } = setup()
    const wrapper = mount(ConsentBanner, { props: { path: '/produkte' }, global })
    await wrapper.get('[data-consent-action="reject_all"]').trigger('click')
    await nextTick()
    expect(env.sendRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject_all', surface: 'first_layer', locale: 'de', user_agent_class: 'Firefox 131' }))
    expect(env.writeCookie).toHaveBeenCalled()
    expect(manager.decided.value).toBe(true)
    expect(wrapper.find('[data-consent-banner]').exists()).toBe(false)
  })

  it('closes after a decision in a policy preview, without writing a record', async () => {
    const { global, env, manager } = setup({ policy: makePolicy({ preview: true }) })
    const wrapper = mount(ConsentBanner, { props: { path: '/produkte' }, global })
    expect(wrapper.find('[data-consent-banner]').exists()).toBe(true)
    await wrapper.get('[data-consent-action="accept_all"]').trigger('click')
    await nextTick()
    expect(env.sendRecord).not.toHaveBeenCalled()
    expect(env.queue).not.toHaveBeenCalled()
    expect(manager.decided.value).toBe(true)
    expect(wrapper.find('[data-consent-banner]').exists()).toBe(false)
    manager.open('preferences', 'privacy_link')
    await nextTick()
    expect(wrapper.find('[data-consent-banner]').exists()).toBe(true)
  })

  it('takes the exempt-path layout from the current route when no path is passed', () => {
    const { global } = setup({ path: '/datenschutz' })
    const wrapper = mount(ConsentBanner, { global })
    expect(wrapper.get('[data-consent-banner]').classes()).toContain('rvx-consent--bar')
  })

  it('keeps an accessible name when a slot replaces the titled layer', async () => {
    const { global, manager } = setup()
    const wrapper = mount(ConsentBanner, {
      props: { path: '/produkte' },
      global,
      attachTo: document.body,
      slots: {
        'first-layer': () => h('div', { class: 'own' }, 'Eigener Text'),
        'preferences': () => h('div', { class: 'own-preferences' }, 'Eigene Einstellungen'),
      },
    })
    for (const which of ['first', 'preferences'] as const) {
      manager.layer.value = which
      await nextTick()
      const dialog = wrapper.get('[data-consent-banner]')
      const labelledBy = dialog.attributes('aria-labelledby')
      if (labelledBy) expect(document.getElementById(labelledBy), which).not.toBeNull()
      else expect(dialog.attributes('aria-label'), which).toBe(which === 'first' ? 'Ihre Privatsphäre' : 'Cookie-Einstellungen')
    }
    wrapper.unmount()
  })

  it('points aria-labelledby at its own title when the layer is not replaced', () => {
    const { global } = setup()
    const wrapper = mount(ConsentBanner, { props: { path: '/produkte' }, global, attachTo: document.body })
    const id = wrapper.get('[data-consent-banner]').attributes('aria-labelledby')!
    expect(document.getElementById(id)?.tagName).toBe('H2')
    expect(wrapper.get('[data-consent-banner]').attributes('aria-label')).toBeUndefined()
    wrapper.unmount()
  })

  it('renders nothing in an editor context [@spec:module-contract:AC-6]', () => {
    const { global } = setup({ editor: true })
    expect(mount(ConsentBanner, { global }).find('[data-consent-banner]').exists()).toBe(false)
    expect(mount(ConsentPreferencesLink, { global }).find('button').exists()).toBe(false)
  })
})

describe('ConsentPreferencesLink', () => {
  it('renders nothing while no policy is loaded', () => {
    const { global } = setup({ policy: null })
    expect(mount(ConsentPreferencesLink, { global }).find('button').exists()).toBe(false)
  })

  it('reopens the second layer with the current decisions preset [@spec:module-contract:AC-4]', async () => {
    const { global, manager, env } = setup({ cookie: decided({ purposes: { statistics: 'granted' } }) })
    const wrapper = mount({ render: () => [h(ConsentPreferencesLink), h(ConsentBanner, { path: '/produkte' })] }, { global })
    expect(wrapper.find('[data-consent-banner]').exists()).toBe(false)
    await wrapper.get('[data-consent-preferences-link]').trigger('click')
    await nextTick()
    expect(manager.layer.value).toBe('preferences')
    const box = (code: string) => wrapper.get(`[data-purpose="${code}"] input`).element as HTMLInputElement
    expect(box('statistics').checked).toBe(true)
    expect(box('marketing').checked).toBe(false)
    expect(box('necessary').disabled).toBe(true)
    await wrapper.get('[data-purpose="marketing"] input').setValue(true)
    await wrapper.get('[data-consent-action="save"]').trigger('click')
    await nextTick()
    expect(env.sendRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'custom', surface: 'privacy_link' }))
    expect(manager.state.value.purposes.marketing).toBe('granted')
  })
})

describe('ConsentGate', () => {
  const embed = { default: () => h('iframe', { src: 'https://www.youtube-nocookie.com/embed/x' }) }

  it('shows a local placeholder and nothing from the vendor until allowed [@spec:module-contract:AC-5]', async () => {
    const { global, env } = setup()
    const wrapper = mount(ConsentGate, { props: { vendor: 'youtube', thumbnail: '/media/preview.jpg' }, slots: embed, global })
    expect(wrapper.find('iframe').exists()).toBe(false)
    const html = wrapper.html()
    for (const host of makePolicy().vendors.find(v => v.code === 'youtube')!.hosts) expect(html).not.toContain(host)
    expect(html).toContain('/media/preview.jpg')
    await wrapper.get('[data-consent-action="load_once"]').trigger('click')
    await nextTick()
    expect(env.sendRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'vendor_grant', surface: 'content_gate', decisions: expect.objectContaining({ vendors: { youtube: 'granted' } }) }))
    expect(wrapper.find('iframe').exists()).toBe(true)
  })

  it('renders the embed for a visitor who allowed the purpose', () => {
    const { global } = setup({ cookie: decided({ purposes: { external_media: 'granted' } }) })
    expect(mount(ConsentGate, { props: { vendor: 'youtube' }, slots: embed, global }).find('iframe').exists()).toBe(true)
  })
})

describe('the manager', () => {
  it('announces a change without the consent id, through the hook, the event and Consent Mode [@spec:module-contract:AC-11]', async () => {
    const { manager, env } = setup()
    const seen: ConsentState[] = []
    manager.onChange(s => seen.push(s))
    await manager.acceptAll()
    expect(seen).toHaveLength(1)
    expect(seen[0]!.purposes.statistics).toBe('granted')
    expect(env.emit).toHaveBeenCalledWith(seen[0])
    expect(JSON.stringify(seen[0])).not.toContain(manager.cookie.value!.id)
    expect(env.gtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({ analytics_storage: 'granted', ad_storage: 'granted' }))
  })

  it('a withdrawal deletes the declared first-party cookies of affected vendors and reloads [@spec:module-contract:AC-9]', async () => {
    const { manager, env } = setup({ cookie: decided({}, 'accept_all') })
    const before = manager.cookie.value!.id
    await manager.withdraw()
    const names = env.forget.mock.calls.map(([entry]) => entry.name)
    expect(names).toEqual(expect.arrayContaining(['_ga', '_ga_<container-id>', '_et_coid']))
    expect(env.reload).toHaveBeenCalledOnce()
    expect(manager.cookie.value!.id).not.toBe(before)
    expect(env.sendRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'withdraw' }))
  })

  it('keeps a failed record for the next page view without blocking the decision [@spec:module-contract:AC-10]', async () => {
    const { manager, env } = setup({ sendRecord: async () => { throw new Error('offline') } })
    await manager.rejectAll()
    expect(manager.decided.value).toBe(true)
    expect(env.writeCookie).toHaveBeenCalled()
    expect(env.queue).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject_all', client_ts: expect.any(String) }))
  })

  it('writes the cookie in the contract format for the consent lifetime', async () => {
    const { manager, env } = setup()
    await manager.acceptAll()
    const [value, maxAge] = env.writeCookie.mock.calls[0]!
    expect(value).toBe(encodeConsentCookie(manager.cookie.value!))
    expect(maxAge).toBe(365 * 86400)
  })
})

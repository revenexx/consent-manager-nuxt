/**
 * The consent manager: one reactive instance per app, created by the plugin and
 * handed to the components through provide/inject. It owns the visitor's
 * cookie, the open/closed state of the banner, the Consent Mode update, the
 * change notifications and the record writes.
 */
import { computed, ref, shallowRef } from 'vue'
import type { ComputedRef, InjectionKey, Ref, ShallowRef } from 'vue'
import {
  allows as allowsRule, decide, encodeConsentCookie, firstPartyStorage, googleSignals, needsDecision,
  pickLocale, revoked, stateOf, userAgentClass,
} from './core'
import type { Choices } from './core'
import type { ConsentCookie, ConsentProvider, ConsentState, DeliveredPolicy, RecordAction, RecordSurface } from './types'

export interface ManagerEnvironment {
  /** Persist the cookie value (or null to clear it). */
  writeCookie: (value: string | null, maxAgeSeconds: number) => void
  /** POST one record body; resolve on success, reject on failure. */
  sendRecord: (body: Record<string, unknown>) => Promise<void>
  /** The current path, for the record and for exempt paths. */
  path: () => string
  /** Push to the Consent Mode data layer (client only). */
  gtag?: (...args: unknown[]) => void
  /** Notify listeners: Nuxt hook + DOM event. */
  emit?: (state: ConsentState) => void
  /** Remove a declared first-party cookie or storage key. */
  forget?: (entry: { name: string, kind: string }) => void
  /** Reload the page (scripts cannot be unloaded). */
  reload?: () => void
  /** Keep a failed record for the next page view. */
  queue?: (body: Record<string, unknown>) => void
}

export interface ConsentManager {
  policy: ShallowRef<DeliveredPolicy | null>
  cookie: Ref<ConsentCookie | null>
  editor: boolean
  locale: Ref<string>
  isOpen: Ref<boolean>
  /** Which layer is showing: the first, or the settings. */
  layer: Ref<'first' | 'preferences'>
  openedFrom: Ref<RecordSurface>
  state: ComputedRef<ConsentState>
  decided: ComputedRef<boolean>
  showBanner: ComputedRef<boolean>
  /** The current route path — for exempt paths and the record. */
  path: () => string
  allows: (vendor: string, purpose?: string) => boolean
  googleSignals: () => ReturnType<typeof googleSignals>
  /** Open the banner; `from` is the surface a record will name. */
  open: (layer?: 'first' | 'preferences', from?: RecordSurface) => void
  close: () => void
  acceptAll: () => Promise<void>
  rejectAll: () => Promise<void>
  save: (choices: Choices) => Promise<void>
  grantVendor: (vendor: string) => Promise<void>
  withdraw: () => Promise<void>
  onChange: (cb: (state: ConsentState) => void) => () => void
  /** Set by the plugin: the @nuxt/scripts consent trigger for one vendor and purpose. */
  trigger?: ConsentProvider['trigger']
}

export const CONSENT_MANAGER: InjectionKey<ConsentManager> = Symbol('consent-manager')

export function createConsentManager(options: {
  policy: DeliveredPolicy | null
  cookie: ConsentCookie | null
  editor: boolean
  locale?: string
  env: ManagerEnvironment
  userAgent?: string
  now?: () => number
}): ConsentManager {
  const now = options.now ?? Date.now
  const env = options.env
  const policy = shallowRef<DeliveredPolicy | null>(options.policy)
  const cookie = ref<ConsentCookie | null>(options.cookie)
  const locale = ref(pickLocale(options.policy, options.locale))
  const isOpen = ref(false)
  const layer = ref<'first' | 'preferences'>('first')
  const openedFrom = ref<RecordSurface>('first_layer')
  const listeners = new Set<(state: ConsentState) => void>()
  // A preview always asks again on load; within the page a decision settles it.
  const previewDecided = ref(false)

  const state = computed(() => stateOf(policy.value, cookie.value, options.editor, now()))
  const decided = computed(() => {
    if (policy.value?.version.preview && !options.editor) return previewDecided.value
    return !needsDecision(policy.value, cookie.value, options.editor, now())
  })
  const showBanner = computed(() => !options.editor && Boolean(policy.value) && (isOpen.value || !decided.value))

  function allows(vendor: string, purpose?: string): boolean {
    const p = policy.value
    if (!p) return false
    const purposes = purpose ? [purpose] : (p.vendors.find(v => v.code === vendor)?.purposes ?? [])
    return purposes.some(code => allowsRule(p, cookie.value, vendor, code, options.editor, now()))
  }

  function notify() {
    const snapshot = JSON.parse(JSON.stringify(state.value)) as ConsentState
    env.gtag?.('consent', 'update', googleSignals(policy.value, cookie.value, options.editor, now()))
    env.emit?.(snapshot)
    for (const cb of listeners) {
      try { cb(snapshot) }
      catch { /* a listener must not break the others */ }
    }
  }

  /** Which surface the visitor is deciding on right now. */
  function surface(): RecordSurface {
    if (layer.value === 'first') return 'first_layer'
    return openedFrom.value === 'privacy_link' ? 'privacy_link' : 'preferences'
  }

  async function apply(action: RecordAction, surface: RecordSurface, choices: Choices = {}) {
    const p = policy.value
    if (!p || options.editor) return
    const before = cookie.value
    const { cookie: next, decisions } = decide(p, before, action, choices, now())
    const gone = revoked(p, before, next, now())
    cookie.value = next
    env.writeCookie(encodeConsentCookie(next), Math.round((Number(p.settings.consent_lifetime_days) || 365) * 86_400))
    isOpen.value = false
    layer.value = 'first'
    if (p.version.preview) previewDecided.value = true

    if (!p.version.preview && p.version.id) {
      const body = {
        consent_id: next.id,
        action,
        surface,
        policy_version_id: p.version.id,
        locale: locale.value,
        decisions,
        client_ts: new Date(now()).toISOString(),
        user_agent_class: userAgentClass(options.userAgent),
        page_path: env.path(),
      }
      // A failed write never blocks the decision in the browser: it is kept and
      // sent again on the next page view.
      await env.sendRecord(body).catch(() => env.queue?.(body))
    }
    notify()

    if (gone.length) {
      for (const entry of firstPartyStorage(gone)) env.forget?.(entry)
      env.reload?.()
    }
  }

  return {
    policy,
    cookie,
    editor: options.editor,
    locale,
    isOpen,
    layer,
    openedFrom,
    state,
    decided,
    showBanner,
    path: () => env.path(),
    allows,
    googleSignals: () => googleSignals(policy.value, cookie.value, options.editor, now()),
    open(which = 'preferences', from) {
      if (options.editor) return
      layer.value = which
      openedFrom.value = from ?? (which === 'preferences' ? 'preferences' : 'first_layer')
      isOpen.value = true
    },
    close() {
      if (decided.value) isOpen.value = false
      layer.value = 'first'
    },
    acceptAll: () => apply('accept_all', surface()),
    rejectAll: () => apply('reject_all', surface()),
    save: choices => apply('custom', surface(), choices),
    grantVendor: vendor => apply('vendor_grant', 'content_gate', { vendors: { [vendor]: 'granted' } }),
    withdraw: () => apply('withdraw', surface()),
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

export type { Choices }

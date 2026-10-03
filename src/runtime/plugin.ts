import { computed } from 'vue'
import {
  defineNuxtPlugin, useCookie, useHead, useRequestFetch, useRequestHeaders, useRequestURL, useRuntimeConfig,
  useScriptTriggerConsent, useState,
} from '#imports'
import { consentModeDefault, consentModeUpdate, decodeConsentCookie, isEditorContext } from './core'
import type { Plugin } from '#app'
import { CONSENT_MANAGER, createConsentManager } from './manager'
import type { ConsentManager } from './manager'
import type { ConsentProvider, ConsentState, DeliveredPolicy } from './types'

interface PublicOptions {
  cookieName: string
  dataLayerName: string
  exemptOnEditorHosts: boolean
  editorHosts: string[]
  editorPaths: string[]
  previewQuery: string
  reloadOnRevoke: boolean
}

const PENDING_KEY = 'rvx_consent_pending'

/**
 * Wires the consent manager into the app — SSR first. On the server it reads
 * `rvx_consent` and the published policy, so the first HTML already holds the
 * banner (when one is owed) and the Consent Mode default as the first entry in
 * <head>. It provides `$consentProvider`, the only thing a loader may couple to.
 */
const plugin: Plugin<{ consentManager: ConsentManager }> = defineNuxtPlugin({
  name: 'consent-manager',
  enforce: 'pre',
  async setup(nuxtApp) {
    const options = useRuntimeConfig().public.consentManager as PublicOptions
    const url = useRequestURL()
    // Behind the platform's proxy the visitor's host may arrive forwarded.
    const forwardedHost = import.meta.server ? useRequestHeaders(['x-forwarded-host'])['x-forwarded-host']?.split(',')[0]?.trim() : undefined
    const editor = isEditorContext(forwardedHost || url.host, url.pathname, {
      enabled: options.exemptOnEditorHosts,
      hosts: options.editorHosts,
      paths: options.editorPaths,
    })

    const policyState = useState<DeliveredPolicy | null>('rvx-consent-policy', () => null)
    const loaded = useState<boolean>('rvx-consent-loaded', () => false)
    const localeState = useState<string>('rvx-consent-locale', () => '')

    if (!loaded.value && !editor) {
      const preview = url.searchParams.get(options.previewQuery) || undefined
      try {
        const fetcher = import.meta.server ? useRequestFetch() : $fetch
        const answer = await fetcher<{ policy: DeliveredPolicy | null }>('/_consent-manager/policy', { query: preview ? { preview } : {} })
        policyState.value = answer?.policy ?? null
      }
      catch {
        policyState.value = null // fail closed
      }
      loaded.value = true
    }
    if (!localeState.value) {
      const i18n = (nuxtApp as unknown as { $i18n?: { locale?: { value?: string } } }).$i18n
      const accept = import.meta.server ? useRequestHeaders(['accept-language'])['accept-language'] : navigator.language
      localeState.value = i18n?.locale?.value || (accept || 'de').split(',')[0]!.trim()
    }

    const cookieRef = useCookie<string | null>(options.cookieName, {
      decode: v => v ?? null,
      encode: v => v ?? '',
      sameSite: 'lax',
      secure: true,
      path: '/',
      default: () => null,
    })

    const manager = createConsentManager({
      policy: policyState.value,
      cookie: decodeConsentCookie(cookieRef.value),
      editor,
      locale: localeState.value,
      userAgent: import.meta.client ? navigator.userAgent : undefined,
      env: {
        writeCookie(value, maxAge) {
          if (import.meta.server) return
          // useCookie writes on change; the attributes have to be set per write
          // so the lifetime follows the policy's consent lifetime.
          const parts = [`${options.cookieName}=${value ?? ''}`, 'Path=/', 'SameSite=Lax', 'Secure', `Max-Age=${value ? maxAge : 0}`]
          document.cookie = parts.join('; ')
        },
        sendRecord: body => $fetch('/_consent-manager/record', { method: 'POST', body }).then(() => undefined),
        path: () => (import.meta.client ? window.location.pathname : url.pathname),
        gtag: (...args) => {
          if (import.meta.server) return
          const w = window as unknown as Record<string, unknown[] | undefined>
          w[options.dataLayerName] = w[options.dataLayerName] || []
          // gtag() pushes an Arguments object, not an array — Google's tags tell
          // the two apart, so the shim has to be a real function call.
          const layer = w[options.dataLayerName]!
          const gtag = function (..._a: unknown[]) {
            // eslint-disable-next-line prefer-rest-params
            layer.push(arguments)
          }
          // eslint-disable-next-line prefer-spread -- an Arguments object needs a real call
          gtag.apply(null, args)
        },
        emit(state: ConsentState) {
          nuxtApp.callHook('consent-manager:change', state)
          if (import.meta.client) window.dispatchEvent(new CustomEvent('revenexx:consent', { detail: state }))
        },
        forget(entry) {
          if (import.meta.server) return
          const pattern = entry.name.includes('<') ? new RegExp(`^${entry.name.split(/<[^>]*>/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`) : null
          const matches = (name: string) => (pattern ? pattern.test(name) : name === entry.name)
          if (entry.kind === 'cookie') {
            const names = document.cookie.split(';').map(c => c.split('=')[0]!.trim()).filter(matches)
            const parts = window.location.hostname.split('.')
            const domains = [''].concat(parts.map((_, i) => parts.slice(i).join('.')).filter(d => d.includes('.')).map(d => `; Domain=.${d}`))
            for (const name of names) for (const domain of domains) document.cookie = `${name}=; Max-Age=0; Path=/${domain}`
          }
          else if (entry.kind === 'local_storage' || entry.kind === 'session_storage') {
            const store = entry.kind === 'local_storage' ? window.localStorage : window.sessionStorage
            for (const key of Object.keys(store)) if (matches(key)) store.removeItem(key)
          }
        },
        reload: () => {
          if (import.meta.client && options.reloadOnRevoke) window.location.reload()
        },
        queue(body) {
          if (import.meta.server) return
          try {
            const pending = JSON.parse(window.localStorage.getItem(PENDING_KEY) || '[]') as unknown[]
            pending.push(body)
            window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending.slice(-10)))
          }
          catch { /* storage unavailable — the decision still holds in the cookie */ }
        },
      },
    })

    nuxtApp.vueApp.provide(CONSENT_MANAGER, manager)

    // Consent Mode v2, basic: the default is the first data layer entry in
    // <head>, before any tag. A returning visitor's update follows it inline.
    const mode = policyState.value?.settings.google_consent_mode ?? 'basic'
    if (mode !== 'off') {
      const update = manager.decided.value && !editor ? consentModeUpdate(manager.googleSignals()) : ''
      useHead({
        script: [{
          key: 'rvx-consent-mode',
          innerHTML: consentModeDefault(options.dataLayerName) + update,
          tagPosition: 'head',
          tagPriority: 'critical',
        }],
      })
    }

    let resolveReady!: () => void
    const ready = new Promise<void>((resolve) => { resolveReady = resolve })

    const provider: ConsentProvider = {
      ready,
      allows: (vendor, purpose) => manager.allows(vendor, purpose),
      trigger: (vendor, purpose) => useScriptTriggerConsent({ consent: computed(() => manager.allows(vendor, purpose)) }),
      googleSignals: () => manager.googleSignals(),
      onChange: cb => manager.onChange(cb),
    }
    manager.trigger = provider.trigger
    nuxtApp.provide('consentProvider', provider)
    resolveReady()

    if (import.meta.client) {
      nuxtApp.hook('app:mounted', async () => {
        // Records that could not be written on an earlier page view.
        let pending: Record<string, unknown>[]
        try {
          pending = JSON.parse(window.localStorage.getItem(PENDING_KEY) || '[]')
        }
        catch {
          pending = []
        }
        if (!pending.length) return
        const failed: Record<string, unknown>[] = []
        for (const body of pending) {
          await $fetch('/_consent-manager/record', { method: 'POST', body }).catch((err: { statusCode?: number }) => {
            if (!err?.statusCode || err.statusCode >= 500 || err.statusCode === 429) failed.push(body)
          })
        }
        try {
          if (failed.length) window.localStorage.setItem(PENDING_KEY, JSON.stringify(failed))
          else window.localStorage.removeItem(PENDING_KEY)
        }
        catch { /* ignore */ }
      })
    }

    return { provide: { consentManager: manager } }
  },
})

export default plugin

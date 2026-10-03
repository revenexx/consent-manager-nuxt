import { addComponent, addImports, addPlugin, addServerHandler, createResolver, defineNuxtModule, hasNuxtModule, installModule } from '@nuxt/kit'
import { defu } from 'defu'
import type { ConsentProvider, ConsentState } from './runtime/types'

export type * from './runtime/types'

export interface ModuleOptions {
  /** Show no banner and load nothing optional on theme editor hosts and editor/preview paths. Default true. */
  exemptOnEditorHosts: boolean
  /** Hosts that count as editor context. Default `['*.theme.rvnxx.site']`. */
  editorHosts: string[]
  /** Path prefixes that count as editor/preview context. Default `['/admin', '/preview']`. */
  editorPaths: string[]
  /** The visitor-state cookie. Fixed by the shared contract; change only for tests. */
  cookieName: string
  /** The Google data layer the Consent Mode default is written to. */
  dataLayerName: string
  /** The cookie the storefront keeps the selected market in (pass-through to `x-revenexx-market`). */
  marketCookie: string
  /** The query parameter that carries a policy preview token. */
  previewQuery: string
  /** Reload after a withdrawal revoked a loaded vendor — scripts cannot be unloaded. Default true. */
  reloadOnRevoke: boolean
  /** Gateway base URL. Runtime: NUXT_CONSENT_MANAGER_API_URL (falls back to NUXT_REVENEXX_API_URL). */
  apiUrl: string
  /** Gateway tenant for local dev — a deployed Site uses the brokered context. Runtime: NUXT_CONSENT_MANAGER_TENANT. */
  tenant: string
  /** Gateway API key for local dev, server-only. Runtime: NUXT_CONSENT_MANAGER_API_KEY. */
  apiKey: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@revenexx/consent-manager-nuxt',
    configKey: 'consentManager',
    compatibility: { nuxt: '>=4.0.0' },
  },
  defaults: {
    exemptOnEditorHosts: true,
    editorHosts: ['*.theme.rvnxx.site'],
    editorPaths: ['/admin', '/preview'],
    cookieName: 'rvx_consent',
    dataLayerName: 'dataLayer',
    marketCookie: 'cover-market',
    previewQuery: 'rvx_consent_preview',
    reloadOnRevoke: true,
    apiUrl: process.env.NUXT_REVENEXX_API_URL || 'https://api.revenexx.com',
    tenant: process.env.NUXT_REVENEXX_TENANT || '',
    apiKey: process.env.NUXT_REVENEXX_API_KEY || '',
  },
  async setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    // The loader layer this module plugs consent into. Installed when the
    // theme did not list it, so the trigger always resolves.
    if (!hasNuxtModule('@nuxt/scripts')) await installModule('@nuxt/scripts')

    nuxt.options.runtimeConfig.consentManager = defu(nuxt.options.runtimeConfig.consentManager as object, {
      apiUrl: options.apiUrl,
      tenant: options.tenant,
      apiKey: options.apiKey,
      marketCookie: options.marketCookie,
    })
    nuxt.options.runtimeConfig.public.consentManager = defu(nuxt.options.runtimeConfig.public.consentManager as object, {
      cookieName: options.cookieName,
      dataLayerName: options.dataLayerName,
      exemptOnEditorHosts: options.exemptOnEditorHosts,
      editorHosts: options.editorHosts,
      editorPaths: options.editorPaths,
      previewQuery: options.previewQuery,
      reloadOnRevoke: options.reloadOnRevoke,
    })

    addPlugin({ src: resolve('./runtime/plugin'), mode: 'all' })
    addImports({ name: 'useConsents', from: resolve('./runtime/composables/useConsents') })
    for (const name of ['ConsentBanner', 'ConsentPreferencesLink', 'ConsentGate']) {
      addComponent({ name, filePath: resolve(`./runtime/components/${name}.vue`) })
    }
    addServerHandler({ route: '/_consent-manager/policy', method: 'get', handler: resolve('./runtime/server/routes/policy.get') })
    addServerHandler({ route: '/_consent-manager/record', method: 'post', handler: resolve('./runtime/server/routes/record.post') })
  },
})

declare module '#app' {
  interface NuxtApp {
    $consentProvider: ConsentProvider
  }
  interface RuntimeNuxtHooks {
    'consent-manager:change': (state: ConsentState) => void | Promise<void>
  }
}

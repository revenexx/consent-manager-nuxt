export default defineNuxtConfig({
  modules: ['@nuxt/scripts', '../src/module'],
  devtools: { enabled: true },
  compatibilityDate: '2025-10-01',
  consentManager: {
    // Local dev only: a deployed Site uses the brokered tenant context.
    // NUXT_CONSENT_MANAGER_TENANT / NUXT_CONSENT_MANAGER_API_KEY in playground/.env
  },
})

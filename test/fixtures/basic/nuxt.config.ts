import ConsentManager from '../../../src/module'

export default defineNuxtConfig({
  modules: ['@nuxt/scripts', ConsentManager],
  compatibilityDate: '2025-10-01',
  consentManager: { tenant: 'fixture', apiKey: 'rvxk_fixture' },
})

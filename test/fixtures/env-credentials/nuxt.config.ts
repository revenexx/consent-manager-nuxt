import ConsentManager from '../../../src/module'

// No credentials in the config: they arrive only through the environment.
export default defineNuxtConfig({
  modules: ['@nuxt/scripts', ConsentManager],
  compatibilityDate: '2025-10-01',
})

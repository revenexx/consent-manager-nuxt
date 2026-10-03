// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: {
    tooling: true,
  },
}).append({
  // The playground and the test fixture are runnable Nuxt apps that rely on
  // Nuxt's generated globals; they are not part of the package build or lint.
  ignores: ['dist', 'coverage', 'node_modules', 'playground', 'test/fixtures', '**/.nuxt', '**/.output'],
})

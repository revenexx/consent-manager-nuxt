# @revenexx/consent-manager-nuxt

## 0.1.0

### Minor Changes

- 561647d: First release: an SSR-rendered consent banner without a third-party script (`<ConsentBanner>`, `<ConsentPreferencesLink>`), content blocking with `<ConsentGate>`, the headless `useConsents()` composable, the `rvx_consent` cookie, Google Consent Mode v2 (basic) and the `$consentProvider` that loaders such as `@revenexx/tag-manager-nuxt` gate `@nuxt/scripts` with. Reads the published policy from the revenexx Consent Manager app and records every decision there, without an IP address.

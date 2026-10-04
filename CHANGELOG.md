# @revenexx/consent-manager-nuxt

## 0.1.1

### Patch Changes

- 49d92a3: Security: gateway credentials are read at runtime only. 0.1.0 copied `NUXT_REVENEXX_API_URL`, `NUXT_REVENEXX_TENANT` and `NUXT_REVENEXX_API_KEY` into the server build when they were set during `nuxt build`; they are now a runtime fallback behind `NUXT_CONSENT_MANAGER_*`, and nothing from the build machine's environment ends up in `.output`. If you built 0.1.0 with a key in the environment, rebuild and rotate that key.

  Fixes:

  - In a policy preview a decision now closes the banner (still without writing a record); the banner shows again on the next page load.
  - `<ConsentPreferencesLink>` renders nothing while no policy is loaded, instead of a button that opens nothing.
  - `<ConsentBanner>` takes the exempt-path layout from the current route on the server and in the browser, so exempt pages render as a bar during SSR without a hydration mismatch. The `path` prop is now only an override.
  - Replacing the `first-layer` or `preferences` slot keeps the dialog's accessible name: it falls back to `aria-label` with the layer's title.
  - `<ConsentGate>`'s `purpose` prop is documented as it behaves: without it the gate opens when any of the vendor's purposes is allowed.

## 0.1.0

### Minor Changes

- 561647d: First release: an SSR-rendered consent banner without a third-party script (`<ConsentBanner>`, `<ConsentPreferencesLink>`), content blocking with `<ConsentGate>`, the headless `useConsents()` composable, the `rvx_consent` cookie, Google Consent Mode v2 (basic) and the `$consentProvider` that loaders such as `@revenexx/tag-manager-nuxt` gate `@nuxt/scripts` with. Reads the published policy from the revenexx Consent Manager app and records every decision there, without an IP address.

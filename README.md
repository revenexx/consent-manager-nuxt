# @revenexx/consent-manager-nuxt

Consent management for revenexx storefronts, as a Nuxt module. The banner is rendered by your
shop's own server — no third-party script loads before a decision — and everything optional
waits until the visitor allows it.

- **SSR first.** The server reads the `rvx_consent` cookie and the published policy, so the first
  HTML already holds the banner when one is owed, and nothing that is not allowed.
- **Reject all beside accept all**, on the first layer, in every layout (box, bar, modal). Not
  configurable.
- **Google Consent Mode v2, basic.** The default (everything denied except `security_storage`,
  `wait_for_update: 500`, `ads_data_redaction`) is the first data-layer entry in `<head>`; the
  `update` follows every decision.
- **`<ConsentGate>`** content blocking: a local placeholder until the vendor is allowed, "Load
  once" for a single vendor.
- **Evidence.** Every decision is recorded in the revenexx Consent Manager app against the exact
  policy version shown — no IP address, no full user agent, no query string.
- **One provider for loaders.** `$consentProvider` is the only coupling to
  `@revenexx/tag-manager-nuxt` or your own `@nuxt/scripts` usage.

The configuration — purposes, vendors, texts — lives in the **Consent Manager** app in Experience
Studio, not in `nuxt.config`.

## Install

```sh
pnpm add @revenexx/consent-manager-nuxt @nuxt/scripts
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/scripts', '@revenexx/consent-manager-nuxt'],
  consentManager: { exemptOnEditorHosts: true },
})
```

A theme using the module declares `requires: [{ capability: "consent-manager.delivery.policy" }]`
so installing it fails where the Consent Manager app is missing.

## Use

```vue
<template>
  <ConsentBanner />                         <!-- first + second layer, slots for every surface -->
  <footer><ConsentPreferencesLink /></footer> <!-- reopens the choice -->
  <ConsentGate vendor="youtube" thumbnail="/media/video-preview.jpg">
    <ScriptYouTubePlayer video-id="aqz-KE-bpKQ" />
  </ConsentGate>
</template>
```

Load a vendor through `@nuxt/scripts` only once it is allowed:

```ts
const { $consentProvider } = useNuxtApp()
useScriptGoogleAnalytics({ id: 'G-XXXX', scriptOptions: { trigger: $consentProvider.trigger('google-analytics', 'statistics') } })
```

Headless, for a theme with its own UI:

```ts
const c = useConsents()
c.state      // Ref<{ purposes: Record<code, 'granted'|'denied'|'objected'>, vendors: … }>
c.decided    // Ref<boolean>
c.allows('google-analytics')
c.open(); c.acceptAll(); c.rejectAll(); c.save({ purposes: { statistics: 'granted' } }); c.withdraw()
```

Listen without importing anything:

```ts
nuxtApp.hook('consent-manager:change', state => { /* … */ })
window.addEventListener('revenexx:consent', e => { /* e.detail = state */ })
```

Neither carries the visitor's consent id.

## The ConsentProvider

```ts
interface ConsentProvider {
  readonly ready: Promise<void>
  allows(vendor: string, purpose: string): boolean
  trigger(vendor: string, purpose: string): Promise<void> & { consented: Ref<boolean> }
  googleSignals(): Record<'ad_storage'|'analytics_storage'|'ad_user_data'|'ad_personalization'|'functionality_storage'|'personalization_storage'|'security_storage', 'granted'|'denied'>
  onChange(cb: (state) => void): () => void
}
```

`allows(vendor, purpose)` is false in an editor or preview context, without a policy, for an
unknown vendor or a purpose the vendor does not serve. Otherwise it follows the effective legal
basis (`vendor.legal_basis_override ?? purpose.legal_basis`): necessary → true; legitimate
interest → unless objected; consent → only when granted (for the purpose, or for the vendor via
"Load once"). See [docs/contract.md](docs/contract.md).

## Configuration

| Option | Default | |
| --- | --- | --- |
| `exemptOnEditorHosts` | `true` | No banner and nothing optional on `editorHosts` / `editorPaths`. |
| `editorHosts` | `['*.theme.rvnxx.site']` | |
| `editorPaths` | `['/admin', '/preview']` | |
| `marketCookie` | `'cover-market'` | Forwarded as `x-revenexx-market` when the request carries none. |
| `dataLayerName` | `'dataLayer'` | |
| `reloadOnRevoke` | `true` | Scripts cannot be unloaded, so a revocation reloads. |

Gateway access: on a deployed Site the platform injects `x-revenexx-tenant` and the brokered
`x-revenexx-context` JWT (ADR-0062), which the module uses. For local development set
`NUXT_CONSENT_MANAGER_TENANT` and `NUXT_CONSENT_MANAGER_API_KEY` (and optionally
`NUXT_CONSENT_MANAGER_API_URL`, default `https://api.revenexx.com`). Nothing configured → the
module fails closed: no banner, nothing optional.

## Server routes

- `GET /_consent-manager/policy` — the published policy of the shop's market, cached 60 s per
  tenant and market.
- `POST /_consent-manager/record` — one decision: at most 4 KB, one per consent id and second,
  identical consecutive decisions collapse; only the fields the app takes are forwarded.

## Development

```sh
pnpm install
pnpm dev:prepare && pnpm dev   # playground
pnpm lint && pnpm test:types && pnpm test && pnpm build
```

Releases are cut with [Changesets](https://github.com/changesets/changesets) and published from
CI with npm trusted publishing and provenance. See [docs/](docs/).

## License

MIT

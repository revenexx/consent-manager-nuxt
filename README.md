<div align="center">

# @revenexx/consent-manager-nuxt

**A server-rendered consent banner for Nuxt that loads no third-party script.**
The first HTML response already contains the banner, the visitor's earlier decision and the Google Consent Mode v2 default. Content embeds, analytics tags and `@nuxt/scripts` loaders stay blocked until the visitor allows them. The policy (purposes, vendors, texts) comes from the revenexx Consent Manager app, and every decision is recorded there.

[![npm version](https://img.shields.io/npm/v/@revenexx/consent-manager-nuxt?color=2B90B6)](https://www.npmjs.com/package/@revenexx/consent-manager-nuxt)
[![npm downloads](https://img.shields.io/npm/dm/@revenexx/consent-manager-nuxt?color=2B90B6)](https://www.npmjs.com/package/@revenexx/consent-manager-nuxt)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

</div>

---

## Why

- 🖥️ **Rendered by your own server.** No consent SaaS script is loaded before the decision. The Nuxt server reads the `rvx_consent` cookie and the published policy, so the first response already contains the banner if one is needed, and nothing the visitor has not allowed. You get no layout shift and no flash of tracking.
- ⚖️ **"Reject all" sits next to "Accept all".** Both buttons are on the first layer, in every layout (`box`, `bar`, `modal`), and share one CSS class, so you cannot style one of them down. This is deliberately not configurable.
- 📊 **Google Consent Mode v2 (basic).** The `default` command (everything denied except `security_storage`) is the first `dataLayer` entry in `<head>`, and each decision pushes an `update`.
- 🧱 **`<ConsentGate>` for embeds.** YouTube, maps and similar embeds are not rendered at all until their vendor is allowed. A local placeholder takes their place, with **Load once** for a single vendor.
- 🔌 **One seam for loaders.** `$consentProvider` plugs straight into `@nuxt/scripts` triggers, and [`@revenexx/tag-manager-nuxt`](https://github.com/revenexx/tag-manager-nuxt) uses the same seam.
- 🧾 **Decisions are recorded without personal data.** Each decision is stored against the exact policy version that was shown. The record carries no IP address, no full user agent and no query string.
- 🛡️ **Fails closed.** If there is no policy, no credentials or the gateway is down, no banner is shown and nothing optional loads.
- 🎨 **Themeable or headless.** CSS variables, a slot for every surface, or `useConsents()` to build your own UI.

> The consent configuration lives in the **Consent Manager** app (revenexx Experience Studio), not in `nuxt.config`: purposes and their legal bases, vendors, cookies and banner texts per locale. This module renders and enforces what that app publishes.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Configuration](#configuration)
- [Credentials and runtime config](#credentials-and-runtime-config)
- [Components](#components) · [`<ConsentBanner>`](#consentbanner) · [`<ConsentGate>`](#consentgate) · [`<ConsentPreferencesLink>`](#consentpreferenceslink)
- [`useConsents()`](#useconsents)
- [The consent provider](#the-consent-provider)
- [Events and hooks](#events-and-hooks)
- [Google Consent Mode v2](#google-consent-mode-v2)
- [Server routes](#server-routes)
- [Recipes](#recipes)
- [TypeScript](#typescript)
- [Compatibility](#compatibility)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)
- [A note on legal bases](#a-note-on-legal-bases)
- [Development and releasing](#development-and-releasing)

## Installation

```bash
npm i @revenexx/consent-manager-nuxt @nuxt/scripts     # or pnpm add / yarn add
```

`@nuxt/scripts` is a peer dependency. The module installs it for you if it is missing from
`modules`, but listing it yourself keeps the order explicit.

## Quick start

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/scripts', '@revenexx/consent-manager-nuxt'],
  consentManager: {
    // every option has a default, see Configuration
  },
})
```

```vue
<!-- app.vue (or your layout) -->
<template>
  <NuxtPage />

  <!-- First layer and settings layer. Renders only when a decision is owed or the visitor reopens it. -->
  <ConsentBanner />

  <footer>
    <!-- Reopens the settings layer with the current decisions preset. -->
    <ConsentPreferencesLink />
  </footer>
</template>
```

Gate an embed:

```vue
<ConsentGate vendor="youtube" thumbnail="/media/video-preview.jpg">
  <iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" title="Video" allowfullscreen />
</ConsentGate>
```

Load a `@nuxt/scripts` script only once the visitor allows it:

```ts
const { $consentProvider } = useNuxtApp()

useScriptGoogleAnalytics({
  id: 'G-XXXXXXX',
  scriptOptions: { trigger: $consentProvider.trigger('google-analytics', 'statistics') },
})
```

`google-analytics` and `statistics` are **codes from your published policy**: a vendor code
and one of that vendor's purpose codes.

For local development, point the module at a tenant (see
[Credentials](#credentials-and-runtime-config)):

```bash
# .env (never commit it)
NUXT_CONSENT_MANAGER_TENANT=<your-tenant>
NUXT_CONSENT_MANAGER_API_KEY=<your-gateway-api-key>
```

Without credentials the module still builds and renders. It shows no banner and allows nothing
optional.

## How it works

```
request ──► Nuxt server (plugin, SSR)
              │ reads cookie rvx_consent
              │ GET /_consent-manager/policy ──► api.revenexx.com
              │                                  /v1/consent-manager/delivery/policy
              │                                  (cached 60 s per tenant + market)
              ▼
            HTML: <head> Consent Mode default (+ update for a returning visitor)
                  <ConsentBanner> if a decision is owed
                  <ConsentGate> placeholders for vendors not allowed
              │
browser ──► visitor decides ──► cookie rvx_consent written
                              ├► gtag('consent','update', …)
                              ├► consent-manager:change hook + revenexx:consent DOM event
                              ├► @nuxt/scripts triggers resolve (scripts load, no reload)
                              └► POST /_consent-manager/record ──► /v1/consent-manager/records
```

**When the banner shows.** It shows when there is no valid `rvx_consent` cookie, when the
cookie predates the latest *material* policy version, or when it is older than the policy's
`consent_lifetime_days` (365 if unset). A malformed cookie counts as no cookie. When the policy
is being previewed, the banner always shows.

**What "allowed" means.** `allows(vendor, purpose)` is `false` in an editor context, without a
policy, for a vendor not in the policy and for a purpose that vendor does not serve. Otherwise
it follows the effective legal basis (`vendor.legal_basis_override ?? purpose.legal_basis`):

| Legal basis | Allowed when |
| --- | --- |
| `necessary` | always |
| `legitimate_interest` | the visitor has not objected (to the purpose or to the vendor) |
| `consent` | the visitor granted the purpose, or granted the vendor via **Load once** |

**What each button writes.**

| Action | Effect |
| --- | --- |
| Accept all | grants every non-necessary purpose |
| Reject all | denies every consent purpose and objects to every legitimate-interest purpose and every vendor whose override is legitimate interest |
| Save (settings) | stores the purposes as toggled. A consent purpose left untouched is denied. |
| Load once (gate) | grants one vendor and keeps everything else |
| Withdraw (`useConsents().withdraw()`) | like Reject all, plus a new consent id |

**Revoking.** A script cannot be unloaded. When a decision takes away a vendor that was
allowed before, the module deletes that vendor's declared first-party cookies and
local/session storage keys and then reloads the page (unless `reloadOnRevoke: false`).

**Editor context.** On theme-editor hosts and under the editor/preview paths, the module does
not fetch the policy, renders no banner and no preferences link, and `allows()` is `false` for
everything. Merchants editing a page never trigger a vendor.

The full normative description (cookie format, gating formula, failure modes) is in
[docs/contract.md](./docs/contract.md).

## Configuration

All options go under `consentManager` in `nuxt.config.ts`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `exemptOnEditorHosts` | `boolean` | `true` | On editor hosts and editor paths, show no banner and load nothing optional. Set `false` to treat them like any other page. |
| `editorHosts` | `string[]` | `['*.theme.rvnxx.site']` | Hosts that count as editor context. `*.example.com` matches any subdomain. On the server, `x-forwarded-host` is used when present. |
| `editorPaths` | `string[]` | `['/admin', '/preview']` | Path prefixes that count as editor context (`/admin` matches `/admin` and `/admin/**`). |
| `cookieName` | `string` | `'rvx_consent'` | Name of the visitor-state cookie. The name is part of the shared contract with other revenexx packages, so change it only for tests. |
| `dataLayerName` | `string` | `'dataLayer'` | The global the Consent Mode commands are pushed to (`window[dataLayerName]`). |
| `marketCookie` | `string` | `'cover-market'` | Cookie that holds the storefront's market code. It is forwarded as `x-revenexx-market` when the request has no such header. Server-only. |
| `previewQuery` | `string` | `'rvx_consent_preview'` | Query parameter that carries a policy preview token. `?rvx_consent_preview=<token>` renders the unpublished draft. Decisions made in a preview are not recorded. |
| `reloadOnRevoke` | `boolean` | `true` | Reload after a decision revoked a vendor that was allowed before, so its scripts stop running. |
| `apiUrl` | `string` | `'https://api.revenexx.com'` | Gateway base URL, with or without a trailing `/v1`. Server-only. |
| `tenant` | `string` | `''` | Gateway tenant for local development. A deployed revenexx Site uses the brokered context instead. Server-only. |
| `apiKey` | `string` | `''` | Gateway API key for local development. Server-only, never sent to the browser. |

The layout (`box` / `bar` / `modal`), the consent lifetime, the exempt paths, whether the cookie
table is shown and whether Consent Mode is on are **policy settings** in the Consent Manager
app, not module options.

## Credentials and runtime config

The two server routes call the revenexx gateway. They work out who they are calling as **per
request**, in this order:

1. **Brokered context (deployed revenexx Sites).** The platform injects `x-revenexx-tenant`
   and a signed `x-revenexx-context` token into each request. The module forwards the token
   as `Authorization: Bearer …`. Nothing needs to be configured. If a request carries the
   tenant header but no token, a configured API key is used **only if** it belongs to that
   same tenant. A key is never sent on behalf of another tenant.
2. **Tenant + API key (everywhere else).** `tenant` and `apiKey` from runtime config are sent
   as `x-revenexx-tenant` + `x-revenexx-api-key`.

If neither is available, the policy route answers `{ policy: null, reason: 'not_configured' }`
and the module fails closed.

The options map to runtime config, so you can set them with environment variables at
**runtime**:

| Environment variable | Runtime config key | Side |
| --- | --- | --- |
| `NUXT_CONSENT_MANAGER_API_URL` | `consentManager.apiUrl` | server |
| `NUXT_CONSENT_MANAGER_TENANT` | `consentManager.tenant` | server |
| `NUXT_CONSENT_MANAGER_API_KEY` | `consentManager.apiKey` | server |
| `NUXT_CONSENT_MANAGER_MARKET_COOKIE` | `consentManager.marketCookie` | server |
| `NUXT_PUBLIC_CONSENT_MANAGER_COOKIE_NAME`, `…_DATA_LAYER_NAME`, `…_EXEMPT_ON_EDITOR_HOSTS`, `…_EDITOR_HOSTS`, `…_EDITOR_PATHS`, `…_PREVIEW_QUERY`, `…_RELOAD_ON_REVOKE` | `public.consentManager.*` | public |

> **Build-time defaults.** If `NUXT_REVENEXX_API_URL`, `NUXT_REVENEXX_TENANT` or
> `NUXT_REVENEXX_API_KEY` are set **while `nuxt build` runs**, they become the defaults for
> `apiUrl`, `tenant` and `apiKey`. That stores them in the server build output. For anything
> other than local development, set the `NUXT_CONSENT_MANAGER_*` variables at runtime instead.

The market is the incoming `x-revenexx-market` header if there is one. Otherwise it is the
value of the `marketCookie` cookie, if it is a plain code of up to 32 characters (letters,
digits, `_`, `-`). Otherwise no market is sent.

## Components

All three components are registered globally. They read the state the plugin created, so
they must be used inside the Nuxt app that installs the module.

### `<ConsentBanner>`

The first layer and the settings layer. It renders only while a decision is owed or after
the visitor reopened it. Place it once, for example in `app.vue`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `layout` | `'box' \| 'bar' \| 'modal'` | policy's `banner_layout`, else `'box'` | Force a layout. On a path listed in the policy's `banner_exempt_paths` (for example the privacy page) the layout is always `bar`, so the page underneath stays readable. |
| `path` | `string` | `window.location.pathname` (client), `'/'` (server) | The current path, used for the exempt-path check. Pass `useRoute().path` if exempt paths must take effect during SSR. |

| Slot | Slot props | Replaces |
| --- | --- | --- |
| `first-layer` | the [banner API](#banner-slot-api) | the whole first layer (title, text, links, buttons) |
| `title` | `{ text }` | the first-layer heading text |
| `body` | `{ text }` | the first-layer body |
| `actions` | the banner API | the three first-layer buttons |
| `preferences` | the banner API | the whole settings layer |
| `purpose` | `{ purpose, active, toggle }` | one purpose row in the settings layer |
| `vendor` | `{ vendor }` | one vendor entry under a purpose |

<a id="banner-slot-api"></a>**Banner API** (slot props of `first-layer`, `actions`, `preferences`):

| Prop | Type | Description |
| --- | --- | --- |
| `texts` | `BannerTexts \| undefined` | The banner texts of the current locale (`title`, `body`, `accept_all`, `reject_all`, `settings`, `save`, `privacy_url`, `imprint_url`, …). |
| `layout` | `'box' \| 'bar' \| 'modal'` | The effective layout. |
| `acceptAll` / `rejectAll` | `() => Promise<void>` | Decide. |
| `showPreferences` | `() => void` | Switch to the settings layer, preset with the current decisions. |
| `save` | `() => Promise<void>` | Save the toggled `choices`. |
| `close` | `() => void` | Close the banner (only closes once a decision exists). |
| `purposes` / `vendors` | `LocalizedPurpose[]` / `LocalizedVendor[]` | The localized policy content. |
| `choices` | `{ purposes: Record<string, Decision> }` | The settings-layer toggles (reactive). |
| `toggle` | `(code: string, on: boolean) => void` | Toggle one purpose. Switching off a legitimate-interest purpose records an objection. |

If you replace `actions`, keep **Reject all** next to **Accept all**. Accessibility: the banner is
`role="dialog"`, can be operated by keyboard and has visible focus. `Escape` closes it once a
decision exists. Only the `modal` layout traps focus. Focus returns to where it was after the
decision. Styling and CSS variables: [docs/theming.md](./docs/theming.md).

### `<ConsentGate>`

Blocks content until its vendor is allowed. Until then the default slot is **not rendered at
all**: it is not merely hidden, and no request reaches the vendor. A placeholder takes its
place.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `vendor` | `string` | required | Vendor code from the policy. |
| `purpose` | `string` | none | Check this purpose only. Without it, the content shows as soon as **any** of the vendor's purposes is allowed. |
| `thumbnail` | `string` | none | A preview image for the placeholder. **Self-host it.** A vendor's own thumbnail URL would make the exact request the gate exists to prevent. |
| `thumbnailAlt` | `string` | `''` | Alt text for the thumbnail. |

| Slot | Slot props | Description |
| --- | --- | --- |
| default | none | The embed. Rendered only when allowed. |
| `placeholder` | `{ vendor, vendorName, text, load, open }` | Your own placeholder. `load()` grants this vendor (**Load once**), `open()` opens the settings layer, `text` is the localized notice with the vendor name filled in. |

The default placeholder shows the thumbnail, the notice and the **Load once** and **Settings**
buttons. The buttons are hidden in editor context and when no policy is loaded.

### `<ConsentPreferencesLink>`

A `<button>` that reopens the settings layer with the current decisions preset. Put it in the
footer and on the privacy page. It is not rendered in editor context.

| Slot | Slot props | Description |
| --- | --- | --- |
| default | `{ text }` | The label. Defaults to the policy's `privacy_link` text or "Cookie settings". |

## `useConsents()`

Headless access for a theme that builds its own UI. Auto-imported. Call it in `setup`.

```ts
const consents = useConsents()

consents.decided.value                // has the visitor decided under the current policy?
consents.state.value                  // { purposes: { statistics: 'granted', … }, vendors: { youtube: 'granted' } }
consents.allows('youtube')            // any purpose of the vendor allowed?
consents.allows('google-analytics', 'statistics')
await consents.acceptAll()
await consents.save({ purposes: { statistics: 'granted', marketing: 'denied' } })
consents.open()                       // reopen the settings layer (as the privacy link does)
```

| Member | Type | Description |
| --- | --- | --- |
| `state` | `ComputedRef<ConsentState>` | Per purpose and per vendor: `'granted' \| 'denied' \| 'objected'`. Never contains the consent id. |
| `decided` | `ComputedRef<boolean>` | `false` while a decision is owed. |
| `policy` | `ShallowRef<DeliveredPolicy \| null>` | The delivered policy (`null` when none could be loaded). |
| `isOpen` | `Ref<boolean>` | Whether the banner was opened explicitly. |
| `locale` | `Ref<string>` | The policy locale in use. |
| `allows` | `(vendor: string, purpose?: string) => boolean` | The gating rule. Without `purpose`: any of the vendor's purposes. |
| `trigger` | `(vendor: string, purpose?: string) => Promise<void> & { consented: Ref<boolean> }` | A `@nuxt/scripts` consent trigger. Without `purpose`, the vendor's **first** purpose is used. |
| `googleSignals` | `() => Record<GoogleSignal, 'granted' \| 'denied'>` | The current Consent Mode signals. |
| `open` | `() => void` | Open the settings layer. The resulting record names the surface `privacy_link`. |
| `close` | `() => void` | Close the banner once a decision exists. |
| `acceptAll` / `rejectAll` | `() => Promise<void>` | Decide. |
| `save` | `(choices: { purposes?: Record<string, Decision>, vendors?: Record<string, Decision> }) => Promise<void>` | Store a custom decision. |
| `grantVendor` | `(vendor: string) => Promise<void>` | **Load once** for one vendor. |
| `withdraw` | `() => Promise<void>` | Withdraw everything and start a new consent id. |
| `onChange` | `(cb: (state: ConsentState) => void) => () => void` | Subscribe. Returns an unsubscribe function. |

The locale is taken from `@nuxtjs/i18n` if it is installed, otherwise from `Accept-Language`
(server) or `navigator.language` (client). The policy locale is matched exactly, then by
language, then falls back to `de`, then to the first locale the policy has.

## The consent provider

`nuxtApp.$consentProvider` is the only thing a script loader needs. It is the seam
[`@revenexx/tag-manager-nuxt`](https://github.com/revenexx/tag-manager-nuxt) uses, and you can
use it with `@nuxt/scripts` directly:

```ts
interface ConsentProvider {
  readonly ready: Promise<void>
  allows: (vendor: string, purpose: string) => boolean
  trigger: (vendor: string, purpose: string) => Promise<void> & { consented: Ref<boolean> }
  googleSignals: () => Record<GoogleSignal, 'granted' | 'denied'>
  onChange: (cb: (state: ConsentState) => void) => () => void
}
```

- `ready` resolves once the policy and the cookie are read, before any component renders.
- `trigger()` wraps `useScriptTriggerConsent` from `@nuxt/scripts`. It resolves the moment the
  vendor becomes allowed, so the script loads without a reload. If the vendor is never allowed,
  it never resolves.
- The plugin runs with `enforce: 'pre'`, so the provider exists before your own plugins run.

## Events and hooks

Three ways to hear about a decision. None of them carries the visitor's consent id.

```ts
// 1. Nuxt runtime hook (typed)
nuxtApp.hook('consent-manager:change', (state) => { /* ConsentState */ })

// 2. DOM event, for code outside Vue (a theme extension, a plain script)
window.addEventListener('revenexx:consent', (e) => {
  const state = (e as CustomEvent).detail // ConsentState
})

// 3. Subscription
const off = useNuxtApp().$consentProvider.onChange((state) => { /* … */ })
```

They fire after each decision (accept, reject, save, load once, withdraw), not on page load.
To read the state on page load, use `useConsents().state`.

## Google Consent Mode v2

While the policy's `google_consent_mode` is `basic` (also when no policy could be loaded), the
module writes an inline script as the first `<head>` entry (`tagPriority: 'critical'`):

```js
window.dataLayer = window.dataLayer || []; function gtag(){ dataLayer.push(arguments) }
gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied',
  ad_personalization: 'denied', functionality_storage: 'denied', personalization_storage: 'denied',
  security_storage: 'granted', wait_for_update: 500 })
gtag('set', 'ads_data_redaction', true)
```

For a returning visitor, a `gtag('consent', 'update', …)` with their current signals follows
in the same script. Every later decision pushes another `update`. Which signals a granted
purpose releases is set per purpose in the policy (`google_signals`). Necessary and
non-objected legitimate-interest purposes count as granted. With `google_consent_mode: off`
nothing is written.

Load GA4 or GTM through `@nuxt/scripts` with a trigger from the provider. Do not configure a
second consent default in the tag: the default belongs to this module. See
[docs/recipes.md → Google Consent Mode](./docs/recipes.md#google-consent-mode-v2-with-ga4-or-gtm).

## Server routes

The module adds two Nitro routes. The browser talks only to these routes and never to the
gateway directly.

| Route | Description |
| --- | --- |
| `GET /_consent-manager/policy` | The published policy for the request's tenant and market, from `GET {apiUrl}/v1/consent-manager/delivery/policy`. Cached in-process for 60 s per tenant + market, with concurrent requests sharing one gateway call. Failures are not cached. "Nothing published" (404) is. `?preview=<token>` reads `/v1/consent-manager/delivery/preview/{token}` uncached. Always answers `200` with `{ policy, reason }`, where `reason` is `null`, `not_configured`, `nothing_published`, `unavailable` or `preview_unavailable`. |
| `POST /_consent-manager/record` | One decision, forwarded to `POST {apiUrl}/v1/consent-manager/records`. Bodies are limited to 4 KB (`413`), must be JSON (`400`) and need valid UUIDs for `consent_id` and `policy_version_id` (`422`). Only the fields the app accepts are forwarded. The page path loses its query and fragment, and the browser is reduced to family + major version (`Chrome 129`). One record per consent id per second (`429`), and an identical repeat is answered `{ ok: true, deduplicated: true }` without storing it. With no credentials the route answers `503`. |

If writing a record fails, the decision still applies in the browser. The record is kept in
`localStorage` (`rvx_consent_pending`, the last 10) and sent again on the next page view.

## Recipes

Customising the banner through slots, a fully headless banner, YouTube behind `<ConsentGate>`,
Google Consent Mode with GA4/GTM, the privacy-page link, editor hosts, local development
against a tenant and running with the Tag Manager are collected in the
**[cookbook → docs/recipes.md](./docs/recipes.md)**.

## TypeScript

The public types are exported from the package root:

```ts
import type {
  ConsentProvider, ConsentState, Decision, LegalBasis, GoogleSignal,
  DeliveredPolicy, PolicyPurpose, PolicyVendor, BannerTexts, LocalizedPurpose, LocalizedVendor,
  ConsentCookie, RecordAction, RecordSurface, ModuleOptions,
} from '@revenexx/consent-manager-nuxt'
```

The module augments `#app`: `NuxtApp.$consentProvider` and the runtime hook
`'consent-manager:change'` are typed.

## Compatibility

| | |
| --- | --- |
| Nuxt | `>= 4.0.0` (SSR; the banner is meant to be server-rendered) |
| `@nuxt/scripts` | `^1.0.0` (peer) |
| Node | `>= 20` |
| Policy source | the revenexx Consent Manager app, reached through `api.revenexx.com` |

## Troubleshooting

- **No banner at all.** Open `/_consent-manager/policy` in the browser and look at `reason`:
  `not_configured` means no credentials (see [Credentials](#credentials-and-runtime-config)),
  `nothing_published` means no policy has been published for this tenant and market, and
  `unavailable` means the gateway could not be reached. Also check you are not on an editor
  host or path (`*.theme.rvnxx.site`, `/admin`, `/preview`).
- **A script never loads after "Accept all".** The vendor and purpose codes passed to
  `trigger()` or `<ConsentGate>` must exist in the published policy, and the purpose must be
  one the vendor serves. An unknown code is never allowed.
- **The page reloads after a decision.** This is intended when a decision revokes a vendor that
  was allowed before, because a loaded script cannot be unloaded. Turn it off with
  `reloadOnRevoke: false` if you handle it yourself.
- **The banner shows again for returning visitors.** A material policy version was published,
  or `consent_lifetime_days` passed. Both are meant to ask again.
- **The banner appears on the privacy page.** Add the page's path to `banner_exempt_paths` in
  the policy. On those paths the banner is shown as a bar, so the page stays readable.
- **`useConsents() needs the @revenexx/consent-manager-nuxt module`.** The composable was called
  outside the Nuxt app's component tree, or the module is not in `modules`.
- **Records fail with `503`.** The record route has no credentials, so the decision only lives
  in the cookie. Configure credentials.

## Related packages

- [`@revenexx/tag-manager-nuxt`](https://github.com/revenexx/tag-manager-nuxt): loads the
  marketing tags configured in the revenexx Tag Manager behind this module's
  `$consentProvider`. Neither package imports the other.
- [`@nuxt/scripts`](https://scripts.nuxt.com): the loader `trigger()` plugs into.

## A note on legal bases

This module carries out what the published policy states: which purposes exist, which legal
basis each one has, which vendors serve them. It does not decide whether a basis fits a given
processing, and nothing in this README is legal advice. The merchant chooses and is
responsible for the legal bases, texts and vendors in the Consent Manager app.

## Development and releasing

```bash
pnpm install
pnpm dev:prepare && pnpm dev                    # playground/
pnpm lint && pnpm test:types && pnpm test && pnpm build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md). Releases are automated with
[Changesets](https://github.com/changesets/changesets) and npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers), so no tokens are involved:

1. `pnpm changeset`: choose a bump and describe the change, then commit the generated file.
2. On push to `main`, the **Release** workflow opens a "Version Packages" PR.
3. Merging that PR bumps the version, updates [CHANGELOG.md](./CHANGELOG.md) and publishes to
   npm with provenance.

## License

[MIT](./LICENSE) © revenexx

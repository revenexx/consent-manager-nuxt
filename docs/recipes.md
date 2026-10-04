# Cookbook

Real-world patterns with `@revenexx/consent-manager-nuxt`. Every example assumes the module is
installed (see the [README](../README.md)) and that the vendor and purpose codes used here
(`youtube`, `google-analytics`, `statistics`, …) exist in **your** published policy. They are
examples, not built-in names.

- [Customise the banner through slots](#customise-the-banner-through-slots)
- [A fully headless banner](#a-fully-headless-banner)
- [YouTube behind `<ConsentGate>`](#youtube-behind-consentgate)
- [A custom gate placeholder](#a-custom-gate-placeholder)
- [Load any `@nuxt/scripts` script only with consent](#load-any-nuxtscripts-script-only-with-consent)
- [Google Consent Mode v2 with GA4 or GTM](#google-consent-mode-v2-with-ga4-or-gtm)
- [The privacy page: link and exempt path](#the-privacy-page-link-and-exempt-path)
- [Editor and preview hosts](#editor-and-preview-hosts)
- [Preview an unpublished policy](#preview-an-unpublished-policy)
- [Local development against a tenant](#local-development-against-a-tenant)
- [React to a decision outside Vue](#react-to-a-decision-outside-vue)
- [Together with the Tag Manager](#together-with-the-tag-manager)

## Customise the banner through slots

Keep the module's behaviour (buttons, settings layer, focus handling) and replace only the
markup you care about:

```vue
<template>
  <ConsentBanner>
    <template #title="{ text }">
      <span class="font-semibold">{{ text }}</span>
    </template>

    <template #body="{ text }">
      <p class="text-sm">{{ text }}</p>
      <p class="text-sm">You can change your choice at any time in the footer.</p>
    </template>

    <!-- Reject all must stay next to Accept all, with the same weight. -->
    <template #actions="{ texts, acceptAll, rejectAll, showPreferences }">
      <div class="grid grid-cols-2 gap-2">
        <button class="btn" @click="rejectAll()">{{ texts?.reject_all }}</button>
        <button class="btn" @click="acceptAll()">{{ texts?.accept_all }}</button>
      </div>
      <button class="link" @click="showPreferences()">{{ texts?.settings }}</button>
    </template>
  </ConsentBanner>
</template>
```

To restyle without new markup, override the CSS variables. See [theming.md](./theming.md).

## A fully headless banner

Skip `<ConsentBanner>` and build your own UI from `useConsents()`. The cookie, the records,
Consent Mode, the hooks and the reload on revoke all keep working, because they live in the
manager rather than in the component.

```vue
<script setup lang="ts">
const c = useConsents()
const show = computed(() => Boolean(c.policy.value) && (!c.decided.value || c.isOpen.value))
const texts = computed(() => c.policy.value?.locales[c.locale.value]?.banner)
</script>

<template>
  <div v-if="show" role="dialog" aria-labelledby="my-consent-title" class="my-banner">
    <h2 id="my-consent-title">{{ texts?.title }}</h2>
    <p>{{ texts?.body }}</p>
    <button @click="c.rejectAll()">{{ texts?.reject_all }}</button>
    <button @click="c.acceptAll()">{{ texts?.accept_all }}</button>
  </div>
</template>
```

A headless banner takes over what the shipped one does for you: rendering the settings layer
(`c.save({ purposes })`), keyboard and focus handling, and putting both choice buttons on the
first layer.

## YouTube behind `<ConsentGate>`

Using `@nuxt/scripts`' YouTube player:

```vue
<ConsentGate vendor="youtube" thumbnail="/media/intro-video.jpg" thumbnail-alt="Product video">
  <ScriptYouTubePlayer video-id="aqz-KE-bpKQ" />
</ConsentGate>
```

Or a plain iframe:

```vue
<ConsentGate vendor="youtube" purpose="external_media">
  <iframe
    width="560" height="315"
    src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"
    title="Product video" allowfullscreen
  />
</ConsentGate>
```

- The iframe is not rendered until `youtube` is allowed, so no request is made to YouTube's
  hosts before that.
- **Load once** grants this one vendor and leaves every other decision as it was.
- The thumbnail must be an image **you** host. YouTube's own `i.ytimg.com` preview would
  contact the vendor before consent.
- Without `purpose`, the content shows as soon as any of the vendor's purposes is allowed.

## A custom gate placeholder

```vue
<ConsentGate vendor="google-maps">
  <iframe src="https://www.google.com/maps/embed?pb=…" title="Directions" />

  <template #placeholder="{ vendorName, text, load, open }">
    <div class="map-placeholder">
      <img src="/media/map-static.png" alt="">
      <p>{{ text }}</p>
      <button @click="load()">Show map from {{ vendorName }}</button>
      <button @click="open()">Privacy settings</button>
    </div>
  </template>
</ConsentGate>
```

`text` is the policy's `gate_text` for the current locale with `{vendor}` replaced. Without a
policy text it is a built-in German or English fallback.

## Load any `@nuxt/scripts` script only with consent

Every registry composable and `useScript` accepts a `trigger`. The provider's trigger resolves
the moment the vendor becomes allowed, so the script loads without a reload, including
right after the visitor clicks **Accept all**.

```ts
const { $consentProvider } = useNuxtApp()

useScriptHotjar({
  id: 1234567,
  scriptOptions: { trigger: $consentProvider.trigger('hotjar', 'statistics') },
})

useScript('https://widget.example.com/loader.js', {
  trigger: $consentProvider.trigger('example-widget', 'functional'),
})
```

From inside a component, `useConsents().trigger('hotjar')` works too. Without a purpose it uses
the vendor's first purpose from the policy.

## Google Consent Mode v2 with GA4 or GTM

The module writes the Consent Mode `default` first in `<head>` and an `update` after every
decision. Load Google's tags through `@nuxt/scripts`, gated on the purpose you assigned to
them:

```ts
const { $consentProvider } = useNuxtApp()

useScriptGoogleTagManager({
  id: 'GTM-XXXXXXX',
  scriptOptions: { trigger: $consentProvider.trigger('google-tag-manager', 'statistics') },
})
```

- Do **not** pass a `defaultConsent` to the tag. The default is written here, before any tag,
  and a second default would compete with it.
- Which signals a purpose releases (`analytics_storage`, `ad_storage`, `ad_user_data`,
  `ad_personalization`, …) is configured per purpose in the Consent Manager app
  (`google_signals`). `security_storage` is always granted.
- To use a different global than `window.dataLayer`, set `consentManager.dataLayerName`.
- To read the signals yourself: `useNuxtApp().$consentProvider.googleSignals()`.
- To turn Consent Mode off for a tenant, set the policy setting `google_consent_mode` to
  `off`. The module then writes nothing.

This is Consent Mode **basic**: Google's tags do not load at all before consent, and the
signals only describe what was decided.

## The privacy page: link and exempt path

Visitors must be able to change their decision. Put the link in the footer and on the
privacy page:

```vue
<footer>
  <NuxtLink to="/privacy">Privacy</NuxtLink>
  <ConsentPreferencesLink />
</footer>
```

Use the default slot for your own label:

```vue
<ConsentPreferencesLink v-slot="{ text }">
  <span class="underline">{{ text }}</span>
</ConsentPreferencesLink>
```

A visitor who has not decided yet must still be able to read the privacy page and the imprint.
Add those paths to `banner_exempt_paths` in the policy. On them the banner is shown as a bar
instead of a box or modal, so the content stays readable. To get the exempt layout during SSR
already, pass the route path:

```vue
<ConsentBanner :path="useRoute().path" />
```

The banner itself links to `privacy_url` and `imprint_url` when the policy texts contain them.

## Editor and preview hosts

When a merchant edits a page in the theme editor, no vendor may load and no banner should get
in the way. By default the module treats these as editor context:

- hosts matching `*.theme.rvnxx.site`
- paths `/admin`, `/admin/**`, `/preview`, `/preview/**`

In editor context the policy is not fetched, no banner and no preferences link render,
`allows()` is `false` for everything, gates show their placeholder without buttons, and the
Tag Manager loads no tag. Adjust it for your own setup:

```ts
consentManager: {
  editorHosts: ['*.theme.rvnxx.site', 'staging-editor.example.com'],
  editorPaths: ['/admin', '/preview', '/cms'],
  // or: exemptOnEditorHosts: false   (treat everything as a normal page)
}
```

On the server, `x-forwarded-host` is used when present, so this also works behind a proxy.

## Preview an unpublished policy

Open any page with the preview token from the Consent Manager app:

```
https://shop.example.com/?rvx_consent_preview=<token>
```

The draft policy is fetched uncached and the banner always shows. Decisions made in a preview
set the cookie in that browser but are **not** recorded. Change the parameter name with
`previewQuery`.

## Local development against a tenant

On a deployed revenexx Site the platform brokers the credentials per request. Locally, give the
module a tenant and a gateway API key through runtime config:

```bash
# .env (git-ignored)
NUXT_CONSENT_MANAGER_TENANT=<your-tenant>
NUXT_CONSENT_MANAGER_API_KEY=<your-gateway-api-key>
# optional:
NUXT_CONSENT_MANAGER_API_URL=https://api.revenexx.com
```

The key stays on the server. The browser only ever calls `/_consent-manager/*`. If the policy
depends on the market, set the `cover-market` cookie (or your `marketCookie`) to a market code,
or send `x-revenexx-market`.

## React to a decision outside Vue

A plain script or a theme extension can listen on `window`:

```js
window.addEventListener('revenexx:consent', (event) => {
  const { purposes, vendors } = event.detail
  if (purposes.statistics === 'granted') startMyStatistics()
})
```

Inside the Nuxt app, prefer the typed hook:

```ts
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('consent-manager:change', (state) => {
    console.log('consent changed', state.purposes)
  })
})
```

Neither carries the consent id, so you cannot use them to identify a visitor.

## Together with the Tag Manager

[`@revenexx/tag-manager-nuxt`](https://github.com/revenexx/tag-manager-nuxt) loads the tags a
merchant configured in the revenexx Tag Manager. List both modules and the Tag Manager finds
`$consentProvider` by itself:

```ts
export default defineNuxtConfig({
  modules: ['@nuxt/scripts', '@revenexx/consent-manager-nuxt', '@revenexx/tag-manager-nuxt'],
})
```

Each tag carries a vendor and a purpose code from the consent policy. The Tag Manager asks
`allows(vendor, purpose)` before loading a tag and again for every event it delivers. Without
this module, the Tag Manager loads only tags whose purpose is `necessary`.

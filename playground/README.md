# Playground

A minimal Nuxt app that runs `@revenexx/consent-manager-nuxt` from source. It is a reference
example and not part of the package's build or test run.

It shows the banner, the decision state, a YouTube embed behind `<ConsentGate>`, a script
loaded through `@nuxt/scripts` only once `google-analytics` / `statistics` is allowed, the
preferences link and a withdraw button.

## Run it

From the repository root:

```bash
pnpm install
pnpm dev:prepare
pnpm dev
```

Point it at a tenant that has the Consent Manager app installed and a published policy:

```bash
# playground/.env (never commit it)
NUXT_CONSENT_MANAGER_TENANT=<your-tenant>
NUXT_CONSENT_MANAGER_API_KEY=<your-gateway-api-key>
```

Without credentials, `/_consent-manager/policy` answers `{ policy: null, reason: 'not_configured' }`
and the module fails closed: no banner, and nothing optional loads.

Things to try:

- Open `/_consent-manager/policy` to see what the server received.
- Decide, then look at the `rvx_consent` cookie and at `window.dataLayer` (the Consent Mode
  `default` first, then an `update`).
- Append `?rvx_consent_preview=<token>` to render a draft policy.
- Open `/admin` or `/preview`: editor context, so no banner and nothing optional.

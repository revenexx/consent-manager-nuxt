# Playground

```sh
pnpm dev:prepare
pnpm dev
```

Point it at a tenant with the consent-manager app installed and a published policy:

```sh
# playground/.env — never commit it
NUXT_CONSENT_MANAGER_TENANT=<tenant>
NUXT_CONSENT_MANAGER_API_KEY=<gateway key>
```

Without credentials the policy route answers `not_configured` and the module fails closed:
no banner, nothing optional loads.

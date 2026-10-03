# Contract

The binding names and shapes are shared with the revenexx Consent Manager app and
`@revenexx/tag-manager-nuxt`. This module never imports the Tag Manager module; the provider is
the only coupling.

## Cookie `rvx_consent`

First-party, `Secure`, `SameSite=Lax`, `Path=/`, strictly necessary; lifetime = the policy's
`consent_lifetime_days`. Value: base64url JSON

```json
{ "id": "<uuid v4>", "v": 7, "p": { "statistics": "g", "marketing": "d" }, "x": { "youtube": "g", "etracker": "o" }, "t": 1759485600 }
```

`g` granted, `d` denied, `o` objected. `p` per purpose, `x` per vendor (content-gate grants and
legitimate-interest objections). The `id` is never handed to tags, the data layer, the hook or
the DOM event. A withdrawal mints a new one. A malformed cookie counts as none.

## Asking again

The banner shows when there is no valid cookie, when `cookie.v < version.material_number`
(`material_number` is additive to the shared shape; without it, `version.material ? number : 0`),
or when `t + consent_lifetime_days` has passed.

## Gating

```
allows(vendor, purpose) :=
  ¬ editorOrPreviewContext ∧ policy loaded ∧ vendor ∈ policy.vendors ∧ purpose ∈ vendor.purposes
  ∧ case vendor.legal_basis_override ?? purpose.legal_basis
      necessary           → true
      legitimate_interest → x[vendor] ≠ "o" ∧ p[purpose] ≠ "o"
      consent             → p[purpose] = "g" ∨ x[vendor] = "g"
  any uncertainty → false
```

A transition from allowed to not allowed reloads the page after deleting the vendor's declared
first-party cookies and storage keys (`_ga_<container-id>` style names match as prefixes).

## Decisions

- **Accept all** grants every consent purpose.
- **Reject all** and **withdraw** deny every consent purpose and object to every
  legitimate-interest purpose and vendor.
- **Save** stores the purposes as chosen; a consent purpose left untouched is denied.
- **Load once** (`vendor_grant`) grants one vendor and keeps everything else.

## Consent Mode v2 (basic)

First in `<head>`:

```js
gtag('consent','default',{ ad_storage:'denied', analytics_storage:'denied', ad_user_data:'denied',
  ad_personalization:'denied', functionality_storage:'denied', personalization_storage:'denied',
  security_storage:'granted', wait_for_update:500 })
gtag('set','ads_data_redaction',true)
```

A returning visitor's `update` follows inline; every decision pushes an `update`. A purpose's
`google_signals` (from the policy) decide which signals it releases. `google_consent_mode: off`
writes nothing. The Tag Manager never writes consent defaults.

## Failure modes

| Situation | Behaviour |
| --- | --- |
| Policy unreachable / nothing published / credentials missing | No banner, `allows` false for everything, Consent Mode default only. |
| Cookie malformed | Treated as no decision. |
| Record write fails | Decision applies; record kept in `localStorage` and retried on the next page view. |
| Editor host or `/admin/**`, `/preview/**` | No banner, no link, nothing optional, no policy fetched. |

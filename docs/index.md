# @revenexx/consent-manager-nuxt: documentation

Start with the [README](../README.md): installation, configuration, components, composable,
provider, events and server routes.

| Page | What it covers |
| --- | --- |
| [Cookbook](recipes.md) | slot customisation, a headless banner, YouTube behind `<ConsentGate>`, Google Consent Mode v2, the privacy link, editor hosts, preview, local development, the Tag Manager |
| [Theming](theming.md) | CSS variables, classes and data attributes, slots, layouts, accessibility |
| [Contract](contract.md) | the normative part: the `rvx_consent` cookie, when the banner asks again, the gating rule, what each decision writes, Consent Mode, failure modes |
| [Acceptance criteria](../specs/module-contract.md) | what the module promises, each criterion bound to a test |

## Related

- [`@revenexx/tag-manager-nuxt`](https://github.com/revenexx/tag-manager-nuxt): the tag loader
  that uses this module's `$consentProvider`.
- The policy is published by the revenexx **Consent Manager** app
  (`revenexx-apps/consent-manager`).

Tracking: [RAD-181](https://linear.app/revenexx/issue/RAD-181) (epic RAD-177). The app side is
RAD-179.

# Contributing to `@revenexx/consent-manager-nuxt`

What the package *is* and how to use it lives in the [README](README.md). This file covers how
work gets in: setup, the checks, and releases.

## Setup

```bash
pnpm install
pnpm dev:prepare     # stub build + type generation for the module and the playground
pnpm dev             # runs playground/ against the module source
```

The playground needs a tenant with a published consent policy to show a banner. See
[playground/README.md](playground/README.md). Without credentials the module fails closed, so
you see no banner, and that is correct behaviour.

## Before you push

CI (`.github/workflows/ci.yml`) runs these on every push and pull request against `main`.
Running them locally only changes when you find out:

| Command | What it checks |
| --- | --- |
| `pnpm lint` | ESLint (`@nuxt/eslint-config`) |
| `pnpm test:types` | `vue-tsc` over the module and, separately, over the Nitro server routes |
| `pnpm test` | Vitest: unit tests of the pure core, the components and the server helpers, plus an SSR test against a fixture app |
| `pnpm build` | `nuxt-module-build`. Run it: a tarball without `dist` is the classic broken release. |

Tests that prove an acceptance criterion carry its tag, `@spec:module-contract:AC-n`, matching
[specs/module-contract.md](specs/module-contract.md). A change to what the module promises
changes that spec and its test together.

## Commits and pull requests

- English, imperative subject line ("Fail closed when the policy route times out").
- One logical change per pull request. Reference the issue it belongs to.
- No secrets anywhere: tenant names and API keys go in a git-ignored `.env`, never in code,
  docs, fixtures or commit messages.

## Releases

[Changesets](https://github.com/changesets/changesets). Every pull request that changes what
ships carries one:

```bash
pnpm changeset       # pick patch / minor / major and describe the change for users
```

Write the changeset for someone upgrading: what changed for them and what they have to do.
That text becomes the [CHANGELOG](CHANGELOG.md) entry.

On push to `main`, `.github/workflows/release.yml` opens or updates a **Version Packages** pull
request. Merging it bumps the version, writes the changelog and publishes to npm with
provenance through npm OIDC trusted publishing, so there is no `NPM_TOKEN`. The trusted
publisher binding is keyed to this repository **and the workflow filename**, so
`release.yml` keeps its name.

A peer-dependency range (`nuxt`, `@nuxt/scripts`) is part of what the package promises. Moving
it needs a changeset even when nothing else changes.

## Changing the shared contract

The cookie name and format, the provider interface and the gating rule are shared with the
revenexx Consent Manager app and with
[`@revenexx/tag-manager-nuxt`](https://github.com/revenexx/tag-manager-nuxt). See
[docs/contract.md](docs/contract.md). A change there is a change on all sides, so coordinate it
rather than landing it here alone.

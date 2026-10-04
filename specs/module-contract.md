---
feature: module-contract
title: The storefront consent module
where:
  - Every server-rendered page of a theme that installs the module
  - The routes /_consent-manager/policy and /_consent-manager/record
ticket: RAD-181
updated: 2026-10-04
---

# The storefront consent module

**The storefront consent module** renders the banner in the theme's own server render, keeps the
visitor's decision in the first-party `rvx_consent` cookie, sends Google Consent Mode v2 and
records every decision in the revenexx Consent Manager. It is the only place a loader asks
whether a vendor may load. Each criterion is claimed by a test tagged
`@spec:module-contract:AC-n`.

## Acceptance criteria

### AC-1 — Before a decision only necessary and objectable vendors may load

- **Given** a first visit without the consent cookie
- **When** the page is server-rendered
- **Then** the HTML holds no script of a consent-based vendor
- verify: unit, ssr

### AC-2 — Consent Mode defaults precede every tag

- **Given** google_consent_mode basic
- **When** the page is server-rendered
- **Then** the consent default command is the first dataLayer entry in the head
- verify: unit, ssr

### AC-3 — Reject all is on the first layer, as prominent as accept all

- **Given** the first layer is shown
- **When** it is rendered in any layout
- **Then** both buttons share size, style and level
- verify: unit

### AC-4 — The privacy link reopens the choice

- **Given** a visitor who decided
- **When** the preferences link is used
- **Then** the second layer opens with the current decisions preset
- verify: unit

### AC-5 — A gated embed shows a local placeholder until its vendor is allowed

- **Given** a ConsentGate for a vendor not allowed
- **When** the page renders
- **Then** no request reaches that vendor's hosts
- verify: unit, ssr

### AC-6 — Editor hosts never load optional vendors

- **Given** a request on a theme editor host
- **When** the page renders
- **Then** no banner and no optional script is present
- verify: unit, ssr

### AC-7 — A record leaves the shop without an address

- **Given** a decision posted with forwarded-for headers and extra fields
- **When** the record route forwards it
- **Then** only the fields the app takes reach the gateway, the path without its query
- verify: unit, ssr

### AC-8 — One record per browser and second, identical decisions once

- **Given** a browser posting decisions in quick succession
- **When** the record route receives them
- **Then** a second record within a second is refused and an identical one is not stored twice
- verify: unit

### AC-9 — Withdrawal removes the vendors' first-party storage and reloads

- **Given** a visitor who allowed vendors that set first-party cookies
- **When** consent is withdrawn
- **Then** those declared cookies are deleted and the page reloads
- verify: unit

### AC-10 — A failed record write never blocks the decision

- **Given** the record route is unreachable
- **When** the visitor decides
- **Then** the decision applies at once and the record is retried on the next page view
- verify: unit

### AC-11 — Changes are announced without the consent id

- **Given** a visitor who decides
- **When** the decision applies
- **Then** the `consent-manager:change` hook, the `revenexx:consent` event and a Consent Mode update carry the state and never the id
- verify: unit

### AC-12 — No gateway credential is part of a build

- **Given** a gateway tenant and API key in the environment while the shop is built
- **When** the build finishes
- **Then** no file of the build output contains either of them
- **Because** a build artifact is shared, cached and deployed far more widely than a runtime secret
- verify: unit, ssr

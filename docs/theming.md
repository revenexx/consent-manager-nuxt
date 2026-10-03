# Theming

The banner ships minimal styles on CSS variables. Override them on `.rvx-consent`:

```css
.rvx-consent {
  --rvx-consent-bg: #fff;
  --rvx-consent-fg: #1a1a1a;
  --rvx-consent-accent: #0f2a44;     /* both choice buttons */
  --rvx-consent-accent-fg: #fff;
  --rvx-consent-radius: 8px;
  --rvx-consent-focus: 3px solid #3b82f6;
}
```

"Reject all" and "Accept all" share one class (`rvx-consent__btn--choice`), so neither can be
styled down without the other.

## Slots

`<ConsentBanner>`: `first-layer`, `title`, `body`, `actions`, `preferences`, `purpose`, `vendor`
— each receives the texts and the actions (`acceptAll`, `rejectAll`, `showPreferences`, `save`,
`close`). A theme replacing `actions` must keep reject all beside accept all.

`<ConsentGate>`: `placeholder` receives `vendor`, `vendorName`, `text`, `load`, `open`. Use a
self-hosted thumbnail — a vendor's own preview image makes the request the gate exists to prevent.

Layouts: `box` (corner, page usable), `bar` (bottom edge; forced on `banner_exempt_paths`),
`modal` (blocks the page, the only one with a focus trap). All are `role="dialog"`, keyboard
operable, with visible focus; focus returns after the decision.

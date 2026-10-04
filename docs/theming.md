# Theming

The components ship minimal, unscoped styles built on CSS variables, so a theme can restyle them
without fighting specificity. There are three levels, from least to most work:

1. **CSS variables.** Change colours, radius and focus ring.
2. **Classes.** Every element has a stable `rvx-consent__*` class.
3. **Slots.** Replace any surface with your own markup. See the
   [README](../README.md#components) for every slot and its props.

## CSS variables

Set them on `.rvx-consent`:

```css
.rvx-consent {
  --rvx-consent-bg: #fff;
  --rvx-consent-fg: #1a1a1a;
  --rvx-consent-accent: #0f2a44;     /* both choice buttons and the secondary button's border */
  --rvx-consent-accent-fg: #fff;
  --rvx-consent-radius: 8px;
  --rvx-consent-focus: 3px solid #3b82f6;
}
```

| Variable | Default | Used for |
| --- | --- | --- |
| `--rvx-consent-bg` | `#fff` | panel background |
| `--rvx-consent-fg` | `#1a1a1a` | text |
| `--rvx-consent-accent` | `#0f2a44` | choice buttons, secondary button border and text |
| `--rvx-consent-accent-fg` | `#fff` | text on the choice buttons |
| `--rvx-consent-radius` | `8px` | panel and button radius |
| `--rvx-consent-focus` | `3px solid #3b82f6` | `outline` of focused buttons, links and inputs |

**Reject all** and **Accept all** share one class, `rvx-consent__btn--choice`, so neither can be
styled down without the other.

## Classes and attributes

| Selector | Element |
| --- | --- |
| `.rvx-consent` | banner root (`role="dialog"`, `data-consent-banner`) |
| `.rvx-consent--box` / `--bar` / `--modal` | the effective layout |
| `.rvx-consent--exempt` | the current path is in the policy's `banner_exempt_paths` |
| `.rvx-consent__backdrop` | modal backdrop |
| `.rvx-consent__panel` | the visible panel |
| `.rvx-consent__title`, `__body`, `__links`, `__actions` | first-layer parts |
| `.rvx-consent__btn` + `--choice` / `--secondary` | buttons, with `data-consent-action="accept_all \| reject_all \| settings \| save \| load_once"` |
| `.rvx-consent__purposes`, `__purpose[data-purpose]`, `__purpose-head`, `__purpose-name`, `__purpose-text`, `__badge` | settings layer |
| `.rvx-consent__vendors`, `__vendor[data-vendor]`, `__transfer`, `__cookies` | vendor details and the cookie table |
| `.rvx-consent-gate[data-consent-gate]`, `__thumbnail`, `__text`, `__actions` | `<ConsentGate>` placeholder |
| `.rvx-consent-link[data-consent-preferences-link]` | `<ConsentPreferencesLink>` (unstyled) |

The `data-*` attributes are stable, so they are also good hooks for end-to-end tests.

## Slots

`<ConsentBanner>`: `first-layer`, `title`, `body`, `actions`, `preferences`, `purpose`, `vendor`.
`first-layer`, `actions` and `preferences` receive the banner API (`texts`, `layout`,
`acceptAll`, `rejectAll`, `showPreferences`, `save`, `close`, `purposes`, `vendors`, `choices`,
`toggle`). `title` and `body` receive `{ text }`, `purpose` receives
`{ purpose, active, toggle }`, `vendor` receives `{ vendor }`. A theme that replaces `actions`
must keep **Reject all** next to **Accept all**.

`<ConsentGate>`: `placeholder` receives `vendor`, `vendorName`, `text`, `load` and `open`. Use a
self-hosted thumbnail: a vendor's own preview image makes the request the gate exists to
prevent.

`<ConsentPreferencesLink>`: the default slot receives `{ text }`.

Replacing `first-layer` or `preferences` also replaces the heading the dialog's
`aria-labelledby` points to. The banner then names the dialog with `aria-label` (the policy's
`title` or `preferences_title`), so it keeps an accessible name without extra markup.

## Layouts

| Layout | Position | Page behind | Focus trap |
| --- | --- | --- | --- |
| `box` | bottom-right corner, max 28rem | usable | no |
| `bar` | full width at the bottom (forced on `banner_exempt_paths`) | usable | no |
| `modal` | centred over a backdrop | blocked | yes |

All three are `role="dialog"`, keyboard operable and have a visible focus ring. The first
focusable element receives focus when the banner opens, focus returns where it was after the
decision, and `Escape` closes the banner once a decision exists.

The banner sits at `z-index: 2147483000`. If your header or a chat widget overlaps it, lower
theirs rather than raising this one.

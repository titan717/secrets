# @secrets/tokens

Design tokens for Secrets — one source for web (CSS variables), React Native (TS objects) and desktop.

```ts
import "@secrets/tokens/tokens.css";          // CSS variables
import { themeColors, vars, space } from "@secrets/tokens";
```

Set attributes on `<html>`:

| Attribute | Values | Default |
|---|---|---|
| `data-theme` | `dark` · `black` (true #000, OLED) · `light` · `system` (follows `prefers-color-scheme`) | `dark` |
| `data-accent` | `violet` · `indigo` · `blue` · `teal` · `orchid` · `rose` · `amber` | `violet` |
| `data-motion` | `reduce` (user override; `prefers-reduced-motion` is honored automatically) | — |

User "My colors": `applyCustomAccent(document.documentElement, "#hex", resolveTheme(pref))` derives every
accent token and auto-adjusts fills/text so outgoing bubbles, buttons and links stay WCAG AA.

## Variables (selection)

- Color: `--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-surface-hover`, `--color-border`,
  `--color-border-strong` (inputs, 3:1), `--color-text`, `--color-text-muted`, `--color-text-subtle`,
  `--color-accent`, `--color-accent-contrast`, `--color-accent-text`, `--color-accent-soft`, `--color-focus-ring`,
  `--color-success` (presence/verified), `--color-danger`, `--color-warning`, `--color-bubble-out(-text|-meta)`,
  `--color-bubble-in(-text|-meta)`, `--color-scrim`, `--color-skeleton`.
- Space (4px base): `--space-1` = 4px … `--space-20` = 80px (`--space-0_5`, `--space-1_5` for 2/6px).
- Radius: `--radius-xs|sm|md|lg|xl|bubble|full`. Type: `--font-sans` (Inter, OFL), `--font-size-{2xs…display}`,
  `--line-height-*`, `--font-weight-*`. Elevation: `--shadow-0…3`. Motion: `--duration-*`, `--easing-*`.
- Gradients (`--gradient-brand|action|aurora`) are reserved for the logo, the single primary action and
  onboarding hero art. Never on surfaces, borders or text.

## Guarantees (tested in `test/contrast.test.ts`)

Every theme × accent: body/muted/subtle/status text ≥ 4.5:1 on all surfaces; bubble text and bubble
meta ≥ 4.5:1; button labels on accent/danger fills (incl. hover/pressed) ≥ 4.5:1; input borders,
presence dot and focus ring ≥ 3:1.

`tokens.css` is generated — edit `src/` and run `pnpm --filter @secrets/tokens gen:css`; lint fails if stale.

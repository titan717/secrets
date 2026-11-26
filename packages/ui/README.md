# @secrets/ui

Shared React UI kit for Secrets (web + desktop shell). Platform-neutral props/types and pure helpers live in
`@secrets/ui/shared` so `apps/mobile` (React Native) can implement the same components with identical APIs.

```tsx
import "@secrets/tokens/tokens.css";
import "@secrets/ui/styles.css";
import { Button, ConversationRow, MessageBubble, Composer, Dialog, ToastProvider } from "@secrets/ui";
```

Set `data-theme` / `data-accent` on `<html>` (see `@secrets/tokens`). Load Inter (OFL) in the app, e.g. `@fontsource-variable/inter`.

## Components

| Area | Components |
|---|---|
| Actions | `Button` (primary/secondary/ghost/danger · sm/md/lg · loading), `IconButton` (required `label`, `pressed`) |
| Forms | `Input`, `TextField` (label, hint, error, success), `Toggle` (role=switch), `RadioGroup` + `Radio` |
| Identity | `Avatar` (initials fallback, presence dot), `AvatarGroup` (+N), `Badge`, `UnreadCount` (99+) |
| Lists | `ListItem`, `ConversationRow` (pinned, unread, draft, muted, group, typing, verified, selected), `StoriesRow` |
| Messages | `MessageBubble` (in/out, grouped `position`, reply preview, reactions, status ticks sending/sent/delivered/read/failed + retry, edited), `DayDivider`, `NewMessagesDivider`, `Composer` (Enter sends, Shift+Enter newline, mic ↔ send) |
| Navigation | `Tabs` (WAI-ARIA, arrows/Home/End) |
| Overlays | `Dialog` (modal / sheet / side; focus trap, Esc, focus restore), `Sheet`, `Tooltip`, `CoachMark` (n of m dots, Got it), `Toast` + `ToastProvider`/`useToast` |
| States | `Skeleton`, `ConversationListSkeleton`, `EmptyState` (ghost mascot) |
| Privacy | `EncryptionBadge`, `SafetyNumber` (12×5 grid, copy, mark verified), `QRProfileCard` (QR encodes `https://secrets.app/u/<username>` only) |

Icons: lucide-react (ISC). QR: qrcode-generator (MIT). Assets: `@secrets/ui/assets/mascot-ghost.png`, `logo-mark.png`
(transparent background, derived from `/assets`).

## Rules
- Styling uses only token CSS variables; no gradients except `--gradient-*` on the primary action/logo; no glass or glow.
- Every interactive element has a visible `:focus-visible` ring (`--color-focus-ring`), an accessible name and keyboard support.
- Tests: `vitest` + Testing Library + axe-core checks for every component (`test/components.test.tsx`).
  Color contrast is guaranteed by `@secrets/tokens` tests (jsdom cannot compute it).

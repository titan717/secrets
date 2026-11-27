# @secrets/web

The Secrets web client — *Your world. Your people. Your space.*
React 18 + Vite + TypeScript, react-router, zustand, lucide-react. Dark-first, with Light and Black (OLED) themes and a user-picked accent.

## Run

```bash
pnpm install
pnpm --filter @secrets/api dev    # API on :8080 (PGlite, seeds the @secrets bot + Secrets HQ dock)
pnpm --filter @secrets/web dev    # web on :5173, proxies /v1 + /health (+ ws) to :8080
pnpm --filter @secrets/web build  # type-check + production build → apps/web/dist
```

### Environment

| Var | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | empty (same origin, via the Vite proxy) | API base URL |
| `VITE_AI_URL` | `http://localhost:8790` | AI service |
| `VITE_VOICE_URL` | `http://localhost:8791` | Voice / LiveKit token service |

## Layout

```
src/
  config.ts            env + URL helpers (apiBase, wsUrl, resolveApiUrl)
  lib/                 api client (typed against @secrets/shared ApiRoutes), realtime WS (backoff, ping, 4001 → logout),
                       outbox (offline queue), media uploads, theme tokens (accents, wallpapers, fonts), time formatting
  stores/              zustand: session, settings (persisted), chat (conversations/messages/presence/typing), docks, ui, toast
  ui/                  UI kit: Button, IconButton, Input/TextArea, Avatar, Badge, Toggle, Tabs, ListItem/ListGroup,
                       Modal (dialog / bottom sheet / side), Toaster, Logo, EmptyState, Coachmark tours, Tooltip, AuthImage
  styles/              tokens.css (CSS variables per theme), base, ui, app (shell/auth), chat
  routes/
    auth/              welcome → username availability → name → password, login
    Shell.tsx          desktop sidebar + mobile bottom nav with centre “+” sheet, connection banner, first-run tips
    HomePage.tsx       greeting, quick actions, moments, recent chats, docks, online now
    chats/             conversation list, chat view, bubbles, composer, info panel, lightbox, new chat/group
    docks/             my docks, discover, create/join (code or link), channel sidebar, members panel, manage modal
    profile/           own profile (avatar upload, edit, share card + QR + card color), public /u/:username
    settings/          account, appearance, notifications, privacy, help & about
    moments/ notes/ tasks/   owned by BUILDER-1 (feature APIs in lib/features)
    ai/ calls/         owned by BUILDER-3 (lib/ai, lib/voice)
```

## Messaging model

- Bodies are always built/read with `sealBody` / `openBody` from `@secrets/shared` (never hand-rolled JSON).
- Sends are optimistic: a pending message is written to the outbox (`localStorage secrets.outbox.<uid>`) and flushed over REST; failures show *retry / discard* and survive reloads. Ticks: clock → sent → delivered → read.
- History loads over REST (newest first, `before` cursor for infinite scroll); live updates arrive over the WS (`message.new/update`, typing, presence, reads, `dock.upsert`, `user.update`).
- Channels are conversations (`channel id === conversation id`), so dock channels reuse `ChatView` with a channel header, a members side panel and a read-only composer for `#announcements` (non-admins).

## Design

- Tokens live in `styles/tokens.css`; `lib/theme.ts → applyAppearance()` sets `data-theme`, `--accent`, `--accent-2`, `--accent-fill`, and `--font-body`. A pre-paint script in `index.html` applies the saved theme to avoid a flash.
- Breakpoint: 860px. Below it the split views collapse to list → detail, and `body.in-chat` hides the bottom nav.
- Motion respects `prefers-reduced-motion` and the in-app *Reduce motion* setting.

## Known gaps

- `GET /v1/users/:username` needs auth, so the logged-out `/u/:username` page shows a sign-in card rather than the full profile.
- Notifications / privacy toggles are stored on the device; typing indicator and 24-hour time are honoured, the rest are placeholders until the API supports them.
- Vault is still a “coming soon” page. No automated tests yet, by request.

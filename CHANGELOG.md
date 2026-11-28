# Changelog

All notable changes. Format: Keep a Changelog. Versions: SemVer (pre-1.0).

## [0.2.0] - 2026-11-28

Screens rebuilt to match the Secrets blueprint. See `docs/BLUEPRINT-CHECKLIST.md` and
`docs/BLUEPRINT-NOTES.md`.

### Added
- Share profile (`/share`): recolourable gradient QR card (tap to cycle, six colour dots), profile
  link with Copy, "Preview for signed-out visitors" toggle, Share (Web Share or copy) and Save image
  (PNG). Other people's cards at `/share?u=<username>`.
- What's new (`/whats-new`): mascot hero, version, sectioned notes, sticky Continue. Opens once after
  an update and from Help.
- Onboarding: Welcome ("The chat app that thinks with you."), Join or sign in (email/username, then
  password; old form at `/login/classic`), Google account chooser with demo accounts, and sign-up as
  name → birthday (date picker, 13+ check) → username (live availability, free suggestions).
- Settings rebuilt per blueprint: home (profile header, QR, Apex card, list, Add account, Log Out),
  Profile, Name (with display-name styles and name banners), About (160 characters, preset chips),
  Account, Appearance (theme, accent solids/gradients/custom with live preview, clock format,
  haptics, app icon, wallpaper), Fonts, Stories privacy and enable toggle with preview, Language,
  Help, Add account, Privacy, Notifications, Storage.
- First-run tips: Chats tour, workspace tour (Today, Notes, Vault), Dock Handles tip, stories
  preview tip; "Show tips again" in Help.
- Mobile chat list per the overview mockup (Stories row, Chats, Grace button, search in header).
- Mock API: stories, notes, tasks and vault data; `POST /v1/auth/google`; sign-up without email or
  password; seeded demo stories.
- ESLint (flat config) and Vitest + Testing Library with tests for each rebuilt screen;
  `pnpm check` runs typecheck, lint, test and build.

### Changed
- Public profile (`/u/:username`): cover with back and QR buttons, overlapping avatar, Add Friend,
  "Media, files and links".
- Repo is frontend only. README rewritten; the mock API is on unless `VITE_USE_MOCKS=false`.
- Default font is the phone's font; default accent is the Secrets purple gradient.

### Removed
- References to the old `apps/*` and `packages/*` monorepo layout.
- The old profile page and share-profile modal (replaced by Settings → Profile and `/share`).

## [0.1.0]
### Added
- AI section ("Grace"): drawer, usage ring, composer with effort levels, models sheet, session menu,
  incognito chats, memory, scheduled tasks, share links.
- Chats, Docks, calls, notes, tasks, vault and moments on the mock API.
- Brand assets (logo, mascot, overview mockup).

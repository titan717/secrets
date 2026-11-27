# UX References — patterns to adapt (not copy)

Secrets adapts interaction patterns only. We never copy another product's name, logo, icons, copy, illustrations, colors-as-brand or assets. Third-party screenshots from the blueprint are **not** stored in this repo; they are described below.

## 1. Secrets' own visual source of truth
- `/assets/mockup-secrets-overview.jpg` — desktop three-panel (sidebar · conversation list · chat · info panel with Members/Media/Files/Links tabs), Notes editor with Tasks + Schedule rail, mobile Home with Stories row, Chats list and bottom nav Home · Calls · + · Docks · Profile.
- `/assets/logo-mark.png` — violet knot mark. `/assets/mascot-ghost.png` — purple hooded ghost, used in empty states, onboarding and error screens (never as decoration noise).
- Palette direction: near-black and deep-navy surfaces, one restrained violet accent (gradients reserved for the primary action and the logo), green for presence/verified, red for destructive.

## 2. Patterns from blueprint screenshots (blueprint pages 1–63)

| Pattern | What we adapt | Secrets rule |
|---|---|---|
| QR profile sharing | Full-bleed card with QR + avatar + @username, accent swatch picker under the card, copy link, "Save image", toggle for signed-out preview | `secrets.app/u/<username>`; QR encodes link only, never keys. Preview toggle off by default. |
| Accent colors & gradients | Grid of solid accents + a few gradients + "My colors"; live bubble preview; Reset | Accent is a user theme token; default violet. Contrast-check every accent against bubble text (WCAG AA). |
| Themes | System / Light / Dark / **Black (true black for OLED)** | Four themes from day one; Black = `#000` surfaces, same tokens. |
| App icon variants | Alternate icon picker | P2 (mobile only). |
| First-unread chat open | Chats/Docks open at the first unread message and jump to a linked message in one step; pinned messages already in place; no spinner flash | Required for MSG inbox → conversation. Show "New messages" divider; persist scroll anchor per conversation. |
| Optional stories | Stories tray is optional; turning it off removes the row; audience: All friends / Public / Only these people / All friends except; blocked users never see | Stories = Moments with 24h audience. Toggle in Settings → Stories with a live "preview it first" before choosing. |
| Coach marks | Short dismissible tooltips (n of m dots, "Got it") introducing Notes, Today, Drive/Vault, search, settings | Max one coach mark per screen visit; "Show tips again" in Help. |
| Username signup | "Pick a username" with live availability + suggestions; name step; can change later | Matches PRD Screen 01. We add password/passkey + recovery steps. No birthday-on-profile. |
| Settings IA | Account, Privacy, Notifications, Appearance, Fonts, Stories, Storage, Language, Help, Add account, Log out | Same grouping; add Devices & Security and Encryption (safety numbers). |
| Account screen | Profile, Username, Email, Verified, 2FA, Password, Linked devices, Delete account | Linked devices is P0 (ID-007). |
| App language | Native-script language list, check on active | i18n-ready strings from day one (P1 translations). |
| Fonts | System font vs product font with live sample | P1. Product font: Inter (OFL). |
| About / status | 160-char bio with suggested presets | Adopt; presets are our own copy. |
| Workspace Today | "Write anything…" quick capture; Today / Upcoming with "Pick a date"; inline task parser (`!high`, dates) | Tasks quick-add on Home + Tasks. |
| Profile styling (display name fonts/banners) | Seen in a community app | Out of scope until P2; never paywall core privacy. |
| Community discovery | "Find your people", tags, Recommended, size filter | DOC-013 (P1). |
| Chat composer w/ slow-mode, mention-only notice | Channel notices inline above composer | Docks channel settings (P2 slow mode). |

## 3. Dribbble benchmarks (visual quality bar, not templates)
1. Chatyuh Desktop — https://dribbble.com/shots/18740647-Chatyuh-Chatting-Desktop
2. Ultra Messenger — https://dribbble.com/shots/22069303-Ultra-Messenger-Messaging-Desktop-App
3. Messenger Web + Mobile — https://dribbble.com/shots/20296813-Messenger-Web-design
4. Dark Messaging UI — https://dribbble.com/shots/26981488-Dark-Mode-Messaging-App-UI-Chat-List-Conversation-Flow
5. Notes Mobile — https://dribbble.com/shots/21565084-Notes-Mobile-App
6. Productivity Tool — https://dribbble.com/shots/21143565-Productivity-tool-ui-design-Task-Todo-Schedule-meeting

Take from them: density of the conversation list, clear unread/pinned hierarchy, message grouping by sender/time, calm info panel, notes typography, task/schedule rails. Avoid: heavy glassmorphism, glowing borders, gradient overload, dashboard-y stat cards.

## 4. Design principles
1. Messaging first — every other module is one click from a conversation (message → task, share to Vault, start call).
2. Calm dark — hierarchy from typography and spacing, not glow. One accent.
3. Native on mobile — full-screen conversation, bottom sheets, swipe actions; never a squeezed desktop.
4. Every state designed — empty (ghost mascot), loading (skeletons, no spinner flashes), error (what happened + what to do), offline (queued badge).
5. Accessible — WCAG 2.2 AA contrast in all four themes, full keyboard nav on desktop, focus rings, reduced-motion support, screen-reader labels.
6. Privacy visible — encryption state, verified safety numbers and device list are first-class UI, not buried.

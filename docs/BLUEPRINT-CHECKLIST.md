# Blueprint checklist

Source of truth: `blueprint_for_secrets.pdf` (66 pages). Pages 1–63 are 1080×2400 phone
screenshots (360×800 dp at 3×), page 64 is the Secrets overview mockup
(`assets/mockup-secrets-overview.jpg`), pages 65–66 are the mascot and logo (`assets/`).

The reference screenshots were taken from sibling apps ("Intridium", "Yapin'", Discord). Product
names in copy are replaced with **Secrets**; everything else (layout, order, copy, sizes) follows the
page. See `BLUEPRINT-NOTES.md` for every assumption.

Viewports used for comparison: mobile 360×800 and 390×844 (the blueprint device is 360 dp wide), desktop 1440×900. Theme: Black (the theme the
blueprint is captured in); System / Light / Dark reuse the same structure with their own tokens.

| Page(s) | Screen | Route | Component | Status |
|---|---|---|---|---|
| 1 | Share profile — recolorable QR card, colour dots, link + Copy, signed-out preview toggle, Share, Save image | `/share` | `routes/profile/ShareProfile.tsx` | done |
| 2 | Broadcast dock channel (pinned message, link, reactions) | `/docks/:id/:channelId` | existing `routes/docks` | existing, unchanged (not in scope list) |
| 3 | Public profile (cover, avatar, name + verified, @handle, about, location · joined, Add Friend, Media files and links) | `/u/:username` | `routes/profile/UserPage.tsx` | done ("Add Friend" starts a chat; no location field in the data model) |
| 4 | Profile (Edit photo, Name, About, visibility note) | `/settings/profile` | `routes/settings/Profile.tsx` (`ProfileScreen`) | done |
| 5 | Account (Profile, Username, Email, Verified · SECURITY · 2FA, Password, Linked devices · Delete account) | `/settings/account` | `routes/settings/Account.tsx` (`AccountScreen`) | done |
| 6 | Chat wallpaper grid | `/settings/appearance/wallpaper` | `routes/settings/Appearance.tsx` (`WallpaperScreen`) | done (CSS art, see notes) |
| 7 | Accent color (Solids, Gradients, My Colors, Preview, Reset) | `/settings/appearance/colors` | `routes/settings/Appearance.tsx` (`ColorsScreen`) | done |
| 8 | Theme (System default, Light, Dark, Black) | `/settings/appearance/theme` | `routes/settings/Appearance.tsx` (`ThemeScreen`) | done |
| 9 | App icon (Default / Dark) | `/settings/appearance/app-icon` | `routes/settings/Appearance.tsx` (`AppIconScreen`) | done |
| 10 | Appearance (Theme, Colors, Clock format, Haptics, App icon · New chat screen toggle) | `/settings/appearance` | `routes/settings/Appearance.tsx` (`AppearanceScreen`) | done |
| — | Clock format, Haptics pickers (not pictured; Theme pattern) | `/settings/appearance/clock`, `/haptics` | `routes/settings/Appearance.tsx` (`ClockScreen`, `HapticsScreen`) | done |
| 11 | Fonts (Phone's font, Secrets Sans) | `/settings/fonts` | `routes/settings/Other.tsx` (`FontsScreen`) | done |
| 12, 28 | My Story (who can view, story availability, Enable stories + preview eye, "Preview it first" tip) | `/settings/stories` | `routes/settings/Other.tsx` (`StoriesScreen`) | done |
| 13 | Add account | `/settings/add-account` | `routes/settings/Other.tsx` (`AddAccountScreen`) | done |
| 14 | Help (What's new, Support center, Contact us, Privacy Policy, Terms, Show tips again, version) | `/settings/help` | `routes/settings/Other.tsx` (`HelpScreen`) | done |
| 15–16 | App language | `/settings/language` | `routes/settings/Other.tsx` (`LanguageScreen`) | done |
| 17–18, 20 | Settings home (profile header, I'm feeling…, QR, Apex card, list, Add account, Log Out) | `/settings`, `/profile` | `routes/settings/Home.tsx` | done |
| 19 | About (160 chars + preset chips + Save) | `/settings/profile/about` | `routes/settings/Profile.tsx` (`AboutScreen`) | done |
| — | Name editor (not pictured; About pattern) | `/settings/profile/name` | `routes/settings/Profile.tsx` (`NameScreen`) | done |
| 21–27 | Workspace tips (Today, Notes, Drive), quick-add sheet | `/tasks`, `/notes` | `ui/Coachmark.tsx` tours | done (tips); workspace layout itself out of scope |
| 23 | Docks tip ("Dock Handles") | `/docks` | `ui/Coachmark.tsx` tour | done |
| 29–32 | Chats first-run tour (Add friends, Ask Grace, Your settings, Stories are optional) | `/chats` | `ui/Coachmark.tsx`, `routes/Shell.tsx` | done |
| 33–37 | What's new (hero, version, sections, sticky Continue) | `/whats-new` | `routes/WhatsNew.tsx` | done |
| 38 | Pick a username (live availability + suggestions + Create account) | `/signup/username` | `routes/auth/Signup.tsx` | done |
| 39–40 | What's your name | `/signup` | `routes/auth/Signup.tsx` | done |
| 41–44 | When's your birthday (+ date picker) | `/signup/birthday` | `routes/auth/Signup.tsx`, `routes/auth/ob.tsx` (`DatePickerDialog`) | done |
| 45 | Google account chooser | from Welcome / Join or sign in | `routes/auth/ob.tsx` (`GoogleChooser`), `routes/auth/useGoogle.tsx` | done (demo accounts) |
| 46 | Welcome ("The chat app that thinks with you.") | `/welcome` | `routes/auth/Welcome.tsx` | done |
| 47 | Join or sign in | `/login` | `routes/auth/Login.tsx` (old form: `/login/classic`, `LoginClassic.tsx`) | done |
| 48–52 | Marketing / download site | — | out of scope (website, not app) | n/a |
| 53, 57–58 | Third-party chat/profile/sign-up references | — | reference only | n/a |
| 55, 61 | Display name style (preview, font tiles, colour None/Solid/Gradient, Surprise me, Reset, Apply) | `/settings/profile/name` | `routes/profile/NameStyle.tsx` (`NameStyleSheet`) | done |
| 56 | Change name banner (search, Make a name banner, tabs, banners, Cancel/Apply) | `/settings/profile/name` | `routes/profile/NameStyle.tsx` (`NameBannerSheet`) | done |
| 59–60, 62–63 | Discord Nitro references | — | reference only | n/a |
| 64 | Secrets overview: desktop chat (sidebar, list, chat, info panel), desktop notes, mobile home | `/chats`, `/notes` | `routes/Shell.tsx`, `routes/chats/*`, `routes/notes/*` | done |
| 65–66 | Mascot, logo | — | `assets/`, `public/` | used as-is |

# Blueprint notes

Assumptions and deliberate differences from `blueprint_for_secrets.pdf`. Everything not listed here
follows the blueprint page named in `BLUEPRINT-CHECKLIST.md`.

## Measuring

- The blueprint pages are 1080×2400 screenshots of a 360 dp device (3×). Sizes were measured at
  360 dp and compared side by side at 360×800 and 390×844. At 390 the UI is the same dp size, so it
  looks about 8% smaller than a scaled-up blueprint page; that is expected.
- The sandbox renders a fallback sans font that is slightly wider than the phone font in the
  screenshots, so some lines wrap one word earlier. Font sizes were not shrunk to compensate.
- The blueprint shows status and navigation bars from Android; they are not part of the app.

## Branding and copy

- "Intridium", "Yapin'" and Discord product names are replaced with **Secrets**. Other copy is kept
  word for word.
- The Intridium flame logo is replaced by `public/logo-mark.png` and the mascot by
  `public/mascot.png`, used as-is.
- Yapin's orange (name style / banner sheets, p55–56) becomes the app accent. The default accent is
  Midnight blue (`g-midnight`, #2c3fb0 → #141b5c), added as the first gradient so the p7 grid keeps
  full rows of six; it replaced the mockup's purple (`g-secrets`, still selectable) at the owner's
  request. Accent text and icons use an AA-safe tint (`--accent`: #8c9cff on dark, #1f2a82 on light);
  fills use the deep colour (`--accent-fill` / `--accent-solid`). The logo and mascot stay purple
  because they are used as-is.
- Neutral greys across the app use the blueprint kit's cool neutrals (#0e0e13 / #17181e / #1f2028)
  instead of the older violet-tinted greys, so blueprint and non-blueprint screens match.
- The share card defaults to the Blue colour (blueprint shows pink) to sit with the midnight accent.
- The Copy / Share link colour and the accent toggle use the app accent instead of the blueprint's
  #3b11fb, which also brings them to AA contrast.
- The What's new hero (p37) is a photo in the blueprint; it uses the mascot on black instead.
  Release notes describe this release, in the blueprint's section/item structure.
- The "Grace 3.5" hero title becomes "Secrets 0.2" (major.minor of `APP_VERSION`).

## Screens

- **Share profile (p1):** colours follow the six dots (blue, red, pink, green, orange, black). The
  black dot is near-invisible on black in the blueprint; ours is a dark grey so it can be seen.
  Tapping the card cycles colours. "Save image" draws the card to a PNG; "Share" uses the Web Share
  API and falls back to copying the link. Other people's cards open at `/share?u=<username>` and
  hide the preview toggle.
- **Public profile (p3):** there is no location field in the data model, so the meta row shows only
  "Joined <month year>". There are no friend requests in Secrets: "Add Friend" starts a chat, and
  "Media, files and links" opens that chat. The verified badge is not shown because users have no
  verified flag yet. Your own page shows "Edit profile" instead.
- **Settings (p4–20):** privacy, notifications and storage are not drawn; they reuse the p5 group
  pattern. Upgrade on the Apex card shows a "coming soon" toast. Non-English languages are listed and
  marked "coming soon". Help's footer credits Lucide icons (ISC).
- **Clock format / Haptics:** not drawn; they use the Theme radio list (p8).
- **Name editor:** not drawn; it uses the onboarding name page (p39) plus rows that open the name
  style (p55) and banner (p56) sheets. In the name style copy, "server" becomes "dock". Extra banner
  groups (e.g. "Space & Glow") follow the "Soft & Fancy" pattern.
- **Wallpaper (p6):** reached from a chat's info panel (p10's Appearance list has no wallpaper row).
  Photo wallpapers are CSS art so the repo ships no photos.
- **App icon (p9):** Default is the logo mark; the alternate is "Secrets Ghost — The ghost glowing on
  black". The web app can't change the launcher icon, so the choice updates the favicon and the
  in-app quick-action tray.
- **Stories (p12, p28):** the tip's Continue opens Settings → Stories.
- **Chats tour (p29–32):** the mobile shell follows the overview mockup (Home, Calls, +, Docks,
  Profile) rather than p29's bottom bar; tour steps point at the matching mockup controls. Step 3 of
  the blueprint is cut off, so it introduces Docks. "Your settings" reads "Tap Profile for profile,
  privacy, notifications and more." The search icon sits in the header as on p29; filter chips are
  removed because the mockup has none. A Grace button floats above the chat list on mobile.
  "Saved Messages" is not built.
- **Workspace tips (p21–27):** the drive tip says "Tap Vault" because the drive is called Vault.
  Notes, Tasks and Vault are reached on mobile from the + sheet. Dock Handles is a single tip with a
  sheet listing `secrets.app/d/<handle>` and a copy button.
- **What's new (p33–37):** opens once after an update (when the stored version differs) and from
  Help. Brand-new accounts start on the current version and see the tour instead. Item bodies use
  the blueprint's dim grey (#4f4f4f on black); it is below AA contrast, kept because the blueprint
  shows it that way.
- **Onboarding (p38–44):** steps are name → birthday → username, as the "Next / Create account"
  buttons imply. Email and password are not asked for (the blueprint has no such step); the mock API
  accepts sign-ups without them. The Next buttons look enabled like the blueprint and focus the
  field or open the date picker if something is missing. A 13+ age check shows its message in place
  of the "This is private…" note. Username ideas are the first name and first name + 4 digits, and
  only free ones are shown.
- **Date picker (p42–43):** the blueprint's header text is white on white (illegible); ours uses the
  calendar colour (#1d2675, midnight blue; blueprint #3c3787) so the selected date can be read. Tapping the month opens a year list.
- **Google chooser (p45):** lists demo accounts (Ava, Maya). Picking one signs in; "Add another
  account" starts sign-up.
- **Join or sign in (p47):** "Continue" asks for the password on a second step. "Use the old sign-in
  page" opens the previous single-form page at `/login/classic`. Terms and Privacy links are
  placeholders.
- **Black theme:** list separators use the background colour, as on the blueprint.
- **Light / Dark / System:** the blueprint only shows Black. Other themes reuse the same layout with
  their own tokens; the What's new page stays black in every theme, as on the blueprint.
- **Accent blue on Share (p1):** "Copy" and "Share" use #3b11fb as drawn. On black this is below AA
  contrast; kept to match the blueprint.

## Desktop

The blueprint's phone pages have no desktop versions. On desktop (≥861 px) the same screens sit in
the shell's content column (max 440–680 px), next to the sidebar from the overview mockup (p64).
Onboarding and sign-in are a centred phone-width column.

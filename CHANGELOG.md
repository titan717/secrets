# Changelog

All notable changes. Format: Keep a Changelog. Versions: SemVer (pre-1.0).

## [Unreleased]
### Added
- AI section redesign ("Grace", per ai.secrets-blueprint-ui): black-first layout with drawer (Projects, Usage & Limits, Memory, Upcoming, Connections, Shared links, Providers, Apex, Recents), mascot + model chip header, usage ring, pill composer with effort gauge and dictation, full-screen effort slider, models sheet, session menu (worked-for, rename, share, project, instructions, privacy, delete), incognito chats, chat search, "Thought for N seconds" / live activity / action row (copy, feedback, read aloud, share, regenerate), assistant-proposed memory with user confirmation, scheduled tasks, read-only share links.
- Five effort levels (instant, low, medium, high, ultra) + custom `{ maxSteps, thinkingBudget }` in `@secrets/shared`; new stream events `thinking.summary`, `activity`, `usage.update`; v2 types for projects, usage, memory, connections, shares, upcoming.
- UI stores are local-first and mirror to the ai.secrets v2 endpoints when "Bridge sync" is on (backend lands in a later phase).
- Repo scaffold: pnpm monorepo, CI (typecheck, lint, test, build, secret scan).
- docs/PRD.md, docs/UX-REFERENCES.md, docs/AGENT-RUNTIME.md, brand assets (logo, mascot, mockup).
- docs/research/crypto-choice.md: E2EE library decision (vodozemac + libsodium) with a working Node proof of concept.

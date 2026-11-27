# Implementation status

Updated: 2026-11-27 · Phase: **0 — architecture, awaiting approval**

Legend: ✅ done · 🟡 in progress · ⬜ pending · ⏸ blocked on a decision

## Done

| Item | Evidence |
| --- | --- |
| GitHub connected (`titan717`, scopes repo/read:org/workflow) | `gh auth status` |
| Five existing repos cloned and audited | `docs/engineering/AUDIT.md` |
| Prior prototype installed, built, booted, signup exercised | audit §1 |
| Architecture, data model, API contract, security plan, roadmap written | `docs/` |
| Consolidated monorepo skeleton created (docs only) | this repo |

## In progress

_None — deliberately paused before code, per the master prompt's "no large code before approval" rule._

## Pending

| Phase | Scope | Est. |
| --- | --- | --- |
| 1 | Monorepo consolidation, tests, CI, flags | 2–3 d |
| 2 | Auth hardening (cookie sessions, verify, reset, delete/export) | 4–6 d |
| 3 | Messaging hardening (R2 uploads, blocks/mutes, notifications, global search) | 5–7 d |
| 4 | Docks (invites, moderation, audit, permission tests) | 3–4 d |
| 5 | Calls (fail-closed membership, group limits, reconnect) | 2–3 d |
| 6 | AI (context consent, approval-only writes, failure UX) | 3–4 d |
| 7 | Security review, observability, load test, deploy | 3–4 d |

## Decisions needing sign-off

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| D1 | **Consolidate into one monorepo** (`secrets`) and archive the four split repos | Yes — single contract, single status file | Keep split repos, duplicate contracts |
| D2 | **Sessions in httpOnly cookie**, not localStorage | Yes — fixes the highest-severity finding | Bearer token in memory + refresh |
| D3 | **Realtime inside `apps/api`**, not a 5th deployable | Yes — no duplicated auth; extractable later | Separate `apps/realtime` now |
| D4 | **SQL repositories, no ORM** (keep PGlite dev path) | Yes — no codegen toolchain on Android | Drizzle/Kysely migration |
| D5 | **Object storage**: R2 in prod, DB adapter in dev | Yes — prompt requires object storage | S3, GCS |
| D6 | **Password hashing**: bcrypt cost 12 (+rehash) | Yes — argon2 native is unreliable on arm64 | `@node-rs/argon2` if it installs |
| D7 | **Email provider**: Resend + console dev driver | Yes — simple API, good deliverability | Postmark, SES |
| D8 | **Experimental modules** (Moments/Notes/Tasks/Vault) hidden behind a flag | Yes — out of MVP scope but keep the work | Delete them |
| D9 | **AI auto-approve** removed from MVP | Yes — prompt requires approval for every write | Keep opt-in auto-approve |
| D10 | **Calls membership check** fail-closed via internal service token | Yes — fixes fail-open finding | Shared DB read access |

## Open questions (need answers before Phase 2)

1. **Email for accounts** — the prompt requires email+password, but the prototype is username-only. Do we
   require a real email at signup (and send verification), or allow username-only with an optional email?
2. **Hosting target** — Render blueprint (single origin, WS supported) vs Railway vs Fly.io? Vercel cannot
   host the WebSocket API.
3. **LiveKit** — LiveKit Cloud (fastest) or self-hosted on the same host?
4. **Domain / product name** — keep `secrets`, or is there a final brand name before we bake URLs into
   emails and OAuth callbacks?
5. **GitHub repo** — make the consolidated `secrets` repo public or private? Push directly to `main` or
   PR-per-phase?
6. **Data residency** — any region requirement for the Postgres/R2 choice?

## Known risks

| Risk | Mitigation |
| --- | --- |
| ~1 900 LOC of security-sensitive code with zero tests | Phase 1 makes tests the gate before any behaviour change |
| Scope creep from existing Moments/Notes/Tasks/Vault code | `experimental` flag off by default; excluded from MVP surface |
| Android dev environment (no Docker/Postgres) | PGlite + in-process bus; CI uses real Postgres |
| AI provider keys in browser | BYOK is the prompt's requirement; disclose and never log |
| Single engineer + 4–5 week estimate | Phase gates; each phase ships independently |

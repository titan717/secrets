# STATE

Updated: 2026-11-26 · Orchestrator: AMIT · Phase: **P1** (signup, 1:1 E2EE chat, multi-device, media, abuse controls)

## Repo decision
Using `github.com/titan717/secrets` (exact name match, was empty) as the monorepo. Other repos seen and **not** used: `api.secrets` (README only), `voice.secretsapi` (empty), `docs.secrets` (empty). Everything lives in the monorepo; those can be archived or used as mirrors later.

## Done
- Cycle 0: tooling check (docs/AGENT-RUNTIME.md), scaffold, CI, PRD, UX references, assets.

## In progress (Cycle 1)
| ID | Owner | Goal |
|---|---|---|
| T-0001 | researcher | Verify E2EE library choice (libsignal vs MLS), licenses, browser/RN support → docs/research/crypto-choice.md |
| T-0002 | builder_backend | apps/api: Fastify + Postgres + auth (username, password/Argon2id), devices, opaque key bundles, rate limits |
| T-0003 | builder_platform | packages/tokens + packages/ui: design tokens (4 themes), core components |
| T-0004 | builder_web | apps/web: shell, routing, signup/onboarding, three-panel Messages UI on mocks |

## Next
- T-0005 client crypto package (after T-0001), envelope fan-out per device, WebSocket delivery, offline queue, receipts.
- T-0006 media attachments (client-encrypted, S3 presigned), abuse controls (block, report, rate limits, message requests).
- P1 gate: QA acceptance matrix + security-critic sign-off.

## Blocked
- none

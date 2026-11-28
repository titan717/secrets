<p align="center"><img src="assets/logo-mark-512.png" width="96" alt="Secrets logo"></p>

# Secrets

**Your world. Your people. Your space.**

Privacy-first, all-in-one communication platform. MVP pillars: **Messaging, Docks, Calls, AI** —
dark-first, username-first, free-first, for desktop and mobile web.

> Status: Phases 0–2 complete (consolidation, tests, CI, flags, auth hardening). Phase 3 next: messaging.
> See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

This repository is the consolidated monorepo. It absorbs the split prototype repos
(`api.secrets`, `ai.secrets`, `voice.secretsapi`, `docs.secrets`).

## Repo layout

| Path | What |
|---|---|
| `apps/web` | Web client (React 18 + Vite, `packages/ui` design system) |
| `apps/api` | Core API: auth, users, conversations, messages, Docks, attachments, realtime |
| `apps/ai` | AI assistant: Gemini/OpenRouter adapters, SSE streaming, agent loop, tool approvals |
| `apps/calls` | LiveKit token issuance and call coordination |
| `packages/shared` | Wire contracts: REST DTOs, WS frames, AI SSE, calls, message envelope |
| `packages/ui` | Shared UI kit |
| `packages/tokens` | Design tokens (dark, black, light, system), contrast-tested |
| `packages/config` | Shared TypeScript / lint / build presets |
| `docs/product` | Scope and roadmap |
| `docs/engineering` | Audit, architecture, data model, API contract, schema |
| `docs/security` | Threat model and security plan |
| `docs/adr` | Architecture decision records |

## Develop

```bash
pnpm install --allow-build=esbuild
pnpm dev        # api :8080 (embedded PGlite) + web :5173
pnpm check      # typecheck + lint + test + build
```

Local development needs **no Postgres and no Redis**: the API boots embedded Postgres (PGlite) and an
in-process event bus. Production sets `DATABASE_URL` / `REDIS_URL` and uses object storage.

## Security model (short)

MVP is **not** end-to-end encrypted and does not claim to be. Transport is TLS; every request is
authorized server-side; sessions live in httpOnly cookies; provider keys are bring-your-own and never
stored on the server. The message envelope (`body` / `ciphertext` + `nonce`) already isolates content so
E2EE can be added later without an API break. See [docs/security/SECURITY-PLAN.md](docs/security/SECURITY-PLAN.md).

## Documentation

- [Audit](docs/engineering/AUDIT.md) · [Architecture](docs/engineering/ARCHITECTURE.md) ·
  [Data model](docs/engineering/DATA-MODEL.md) · [API contract](docs/engineering/API-CONTRACT.md)
- [Security plan](docs/security/SECURITY-PLAN.md) · [Roadmap](docs/product/ROADMAP.md)
- [Status](IMPLEMENTATION_STATUS.md)

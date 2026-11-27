# Secrets

Privacy-first, all-in-one communication platform. MVP pillars: **Messaging, Docks, Calls, AI**.

This repository is the consolidated monorepo. It supersedes the split prototype repos
(`api.secrets`, `ai.secrets`, `voice.secretsapi`, `docs.secrets`, `secrets`).

## Status

**Phase 0 — architecture & approval.** No application code has been written in this repo yet.
The audit, architecture, schema, API contract, security plan and roadmap live in `docs/`
and are pending owner approval.

See [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md).

## Layout (target)

```
secrets/
  apps/
    web/          React + Vite client (design system from packages/ui)
    api/          Fastify 5: auth, users, conversations, messages, docks, attachments, realtime
    ai/           AI assistant service: provider adapters, agent loop, tool approvals
    calls/        LiveKit token issuance + call coordination
  packages/
    shared/       Contracts: REST DTOs, WS frames, AI SSE, call payloads, envelope
    ui/           Design system components
    tokens/       Design tokens (color/scale/theme), contrast-tested
    config/       Shared tsconfig / lint / build presets
  infra/
    docker/       Dockerfiles, compose
    scripts/      ops + smoke scripts
  docs/
    product/      scope, roadmap
    engineering/  audit, architecture, data model, API contract
    security/     threat model, security plan
    adr/          decision records
```

## Quick start (target, after Phase 1)

```bash
pnpm install --allow-build=esbuild
pnpm dev            # api :8080 (PGlite) + web :5173
```

Local development needs **no Postgres and no Redis**: the API boots embedded Postgres
(PGlite) and an in-process event bus. Production sets `DATABASE_URL` / `REDIS_URL`.

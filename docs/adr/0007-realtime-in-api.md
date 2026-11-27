# ADR 0007 — Realtime stays inside `apps/api`

Status: proposed · 2026-11-27

**Context.** The master prompt's reference layout lists `apps/realtime`, but also warns against
unnecessary microservices. A separate gateway would re-verify sessions, re-check conversation
membership and call back into the API for every frame.

**Decision.** Implement WebSockets as `apps/api/src/modules/realtime` behind a bus interface
(`publish`, `addConn`, `removeConn`). With `REDIS_URL` set, the bus uses Redis pub/sub so multiple API
replicas share fan-out.

**Consequences.** One deployable, no network hop on the hot path, no duplicated authorization. Scaling
past one process requires sticky sessions or the Redis adapter (already supported). Extraction path:
move the module behind the same bus contract into `apps/realtime` if fan-out ever dominates CPU.

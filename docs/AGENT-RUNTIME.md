# Agent Runtime — how Secrets is built

Checked 2026-11-26 against the Perplexity API docs and Computer's own capability references.

## Perplexity API (developer platform)
Source: https://docs.perplexity.ai/docs/getting-started/overview and https://docs.perplexity.ai/guides/rate-limits-usage-tiers

- APIs: Orchestrator (frontier + open-weight models, OpenAI/Anthropic request formats, routing + failover), Agent (web-grounded, tools), Search, Embeddings, Decisions, Monitor, Context.
- Tiers by lifetime credit purchases: Tier 0 ($0) → Tier 5 ($5,000+).
- Agent API limits: Tier 0 = 1 QPS, 5M TPM; Tier 5 = 33 QPS, 16M TPM. Token limits are per org and per model. 429s carry `error.type` + `Retry-After`; back off, never resubmit a paused request.
- API credits (console.perplexity.ai) are separate from Computer credits.
- Secrets itself does not call the Perplexity API. Nothing here ships in the product.

## Computer (the build runtime)
- Agents are spawned by the orchestrator (AMIT, `/root`) with a plain-text task contract. Each subagent has its own context and tools and **shares this sandbox filesystem** (`/home/user/workspace`). Subagents report back by message only.
- Models are selectable per agent (frontier models from several providers). Default model unless a task needs a cheaper/faster one.
- **Credits are not observable.** Computer cannot read the remaining balance or the cost of a call. The PRD's "under 10% → WRAP-UP" rule therefore uses a proxy:
  - Every cycle ends with a committed `STATE.md` + `HANDOFF.md`, so a hard stop at any moment loses at most one in-flight task.
  - Agents keep tasks small (one module / one gate), commit when green, and never leave main red.
  - If the session is interrupted or the user signals low credits, AMIT enters WRAP-UP immediately.
- Sandbox limits: 2 vCPU, 7 GB RAM, ~13 GB free disk, Node 20, no Docker. pnpm is at `$HOME/.local/bin/pnpm` (prefix each shell with `export PATH=$HOME/.local/bin:$PATH`).
- Local DB: tests use PGlite (real Postgres compiled to WASM) and an in-memory Redis adapter; CI uses real Postgres 16 + Redis 7 service containers.

## Agent call design
| Agent | When spawned | Owns (write scope) |
|---|---|---|
| AMIT `/root` | always | docs/STATE.md, docs/HANDOFF.md, CHANGELOG.md, root config, merges |
| builder_backend | per phase | `apps/api/**`, `packages/protocol/**` |
| builder_web | per phase | `apps/web/**` |
| builder_platform | per phase | `packages/ui/**`, `packages/tokens/**`, `apps/mobile/**`, `apps/desktop/**` |
| researcher | before new deps | `docs/research/**` |
| security_critic | after every crypto/auth diff | `docs/security/**` (review notes only) |
| qa | per gate | `tests/e2e/**`, acceptance matrix |
| ux_designer, docs | as needed | `docs/design/**`, README / API docs |

Rules: disjoint write scopes per cycle (no two builders on the same files); agents commit only inside their scope; AMIT rebases and merges; max 2 fix retries per task before it is logged as blocked in STATE.md.

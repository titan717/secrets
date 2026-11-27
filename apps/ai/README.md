# ai.secrets

The AI agent service for **Secrets**. It streams chat from **Gemini** or **OpenRouter** over SSE and can run a multi-step tool loop with **GitHub** and **Secrets** tools. Write tools pause for user confirmation.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/titan717/ai.secrets)
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/titan717/ai.secrets)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/titan717/ai.secrets&project-name=secrets-ai)

- **Render** reads [`render.yaml`](render.yaml), the Blueprint, and prompts for any `sync: false` env vars.
- **Railway** builds the [`Dockerfile`](Dockerfile) using [`railway.json`](railway.json), with a `/health` healthcheck. If the button opens an empty project, use **New Project → Deploy from GitHub repo → titan717/ai.secrets** instead. Railway's official one-click buttons require a published template.
- **Vercel** deploys [`api/index.ts`](api/index.ts) as a Node.js Function, using [`vercel.json`](vercel.json).

The service stores no keys. The browser sends the provider key, GitHub token and Secrets session token **per request in headers**. They are never logged: Fastify's logger redacts them.

## Run locally

```bash
pnpm install
cp .env.example .env   # optional
pnpm dev               # or: pnpm build && pnpm start
curl localhost:8790/health
```

## Environment

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8790` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `CORS_ORIGIN` | `*` | `*` or a comma-separated list of origins |
| `SECRETS_API_URL` | — | Default Secrets API base, used when the body has no `secrets_api_url` |
| `MODELS_CACHE_TTL_MS` | `600000` | How long `/v1/models` results are cached |
| `MAX_TOOL_RESULT_CHARS` | `16000` | Tool results are truncated to this size before they go to the model |
| `PROVIDER_STALL_TIMEOUT_MS` | `120000` | Abort a provider stream that sends nothing for this long |
| `OPENROUTER_APP_URL` / `OPENROUTER_APP_TITLE` | — | OpenRouter attribution headers |
| `LOG_LEVEL` | `info` | Pino log level |

## Endpoints

The contract is in [`src/contract.ts`](src/contract.ts), an identical copy of `api.secrets/packages/shared/src/ai.ts`.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/v1/chat` | Body `AiChatRequest`. Headers: `x-provider-key` (required), `x-github-token`, `x-secrets-token`. Responds with `text/event-stream` and `data: <AiStreamEvent>` lines. The first event is `{type:"run", run_id}`. |
| `POST` | `/v1/chat/:runId/confirm` | `{ call_id, approve }` resumes a run paused on `confirm_required`. A run waits 5 minutes, then treats the call as denied. |
| `POST` | `/v1/chat/:runId/stop` | Aborts the run, which emits `done: stopped`. Closing the SSE connection also stops it. |
| `GET` | `/v1/models?provider=gemini\|openrouter\|mock` | Header `x-provider-key` (not needed for `mock`). Returns `{ models: {id,name}[] }`, cached (`?refresh=1` bypasses the cache). |
| `GET` | `/health` | `{ ok, service, version, active_runs }` |

```bash
curl -N localhost:8790/v1/chat -H 'content-type: application/json' -H "x-provider-key: $OPENROUTER_API_KEY" -d '{
  "provider":"openrouter","model":"openai/gpt-4o-mini","effort":{"level":"low"},
  "messages":[{"role":"user","content":"Hello"}],
  "agent_mode":false,"tools_enabled":{"github":false,"secrets":false},"auto_approve":false}'
```

### Mock provider (no key)

`provider: "mock"` (model `mock-1`) works without `x-provider-key`, so the web app can be demoed end to end. The contract's `AiProvider` is `"gemini" | "openrouter" | "mock"`.

- **Agent mode off**: streams a short reasoning delta, then a canned reply that echoes the user's message.
- **Agent mode on**: offers two demo tools in addition to any enabled real tools.
  1. Step 1 calls `demo_search`, a read tool.
  2. Step 2 calls `demo_create_note`, a write tool. This emits `confirm_required` unless `auto_approve` is set.
  3. Step 3 answers, and the answer changes depending on whether you approved or denied the note.
- `/v1/models?provider=mock` returns `{ models: [{ id: "mock-1", name: "Mock (demo, no key)" }] }`.

```bash
curl -N localhost:8790/v1/chat -H 'content-type: application/json' -d '{"provider":"mock","model":"mock-1","effort":{"level":"low"},
  "messages":[{"role":"user","content":"plan a trip"}],"agent_mode":true,"tools_enabled":{"github":false,"secrets":false},"auto_approve":false}'
# then: curl -XPOST localhost:8790/v1/chat/<run_id>/confirm -H 'content-type: application/json' -d '{"call_id":"<call_id>","approve":true}'
```

### Effort

| Level | Max agent steps | OpenRouter | Gemini 2.5 | Gemini 3.x / 4 |
|---|---|---|---|---|
| low | 3 | `reasoning.effort: low` | `thinkingBudget: 1024` | `thinkingLevel: LOW` |
| medium | 8 | `medium` | `8192` | `MEDIUM` |
| high | 20 | `high` | `24576` (Pro `32768`) | `HIGH` |
| custom | `maxSteps` | `reasoning.max_tokens = thinkingBudget` | `thinkingBudget` | 3.x `thinkingBudget`; 4: nearest level |

[docs/PROVIDERS.md](docs/PROVIDERS.md) has the sources and details.

### Agent mode and tools

- `agent_mode: false` runs a single streamed completion with no tools.
- `agent_mode: true` runs up to *max steps* model calls. Each step emits `step`, then `text`/`reasoning` deltas, then `tool_call` / `tool_result` for every call. The run ends with `done: complete | step_limit | stopped`, or with `error`.
- **GitHub** (`tools_enabled.github`, needs `x-github-token`): `list_repos`, `read_file`, `search_code`, `list_issues`, and the write tools `create_branch`, `commit_file`, `open_issue`, `open_pr`.
- **Secrets** (`tools_enabled.secrets`, needs `x-secrets-token` plus `secrets_api_url` or `SECRETS_API_URL`): `read_conversation`, `summarize_dock_channel`, and the write tool `draft_message`. `draft_message` only returns a draft and never sends anything.
- A write tool with `auto_approve: false` emits `confirm_required` and waits for `/confirm`. A denied call returns `tool_result` with `denied: true`, and the model is told so.

## Deploying

- **Render / Railway / Docker**: long-running Node process, so everything works, including confirm and stop.
- **Vercel**: `api/index.ts` wraps the Fastify app in a Node.js Function (`maxDuration` 300 s) and `vercel.json` rewrites every path to it. SSE streams work. **Limitation:** the run registry is in-memory, so `/confirm` and `/stop` only work when they reach the same function instance as the open stream, which serverless does not guarantee. On Vercel, use `auto_approve: true`, or deploy to Render/Railway if you need confirmations. Closing the SSE connection still stops a run.

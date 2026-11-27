# voice.secretsapi

The voice and video service for **Secrets**. It creates LiveKit rooms for conversations and issues join tokens to signed-in Secrets users.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/titan717/voice.secretsapi)
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/titan717/voice.secretsapi)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/titan717/voice.secretsapi&project-name=secrets-voice&env=LIVEKIT_URL,LIVEKIT_API_KEY,LIVEKIT_API_SECRET,JWT_SECRET&envDescription=LiveKit%20credentials%20and%20the%20Secrets%20API%20JWT_SECRET&envLink=https://github.com/titan717/voice.secretsapi%23environment)

- **Render** reads [`render.yaml`](render.yaml), the Blueprint, and prompts for any `sync: false` env vars.
- **Railway** builds the [`Dockerfile`](Dockerfile) using [`railway.json`](railway.json), with a `/health` healthcheck. If the button opens an empty project, use **New Project → Deploy from GitHub repo → titan717/voice.secretsapi** instead. Railway's official one-click buttons require a published template.
- **Vercel** deploys [`api/index.ts`](api/index.ts) as a Node.js Function, using [`vercel.json`](vercel.json).

## Run locally

```bash
pnpm install
cp .env.example .env     # fill in LiveKit + JWT_SECRET
pnpm dev                 # or: pnpm build && pnpm start
curl localhost:8791/health
```

For a free LiveKit server, create a project at [LiveKit Cloud](https://cloud.livekit.io), or run `livekit-server --dev` locally (`ws://localhost:7880`, key `devkey`, secret `secret`).

## Environment

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8791` | HTTP port |
| `CORS_ORIGIN` | `*` | `*` or a comma-separated list of origins |
| `LIVEKIT_URL` | — | `wss://<project>.livekit.cloud`, the URL clients connect to |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | — | LiveKit credentials. If any are missing, the room and token endpoints return **503** |
| `JWT_SECRET` | — | The **same** secret the Secrets API uses (HS256 session JWT `{sub, username, did}`). If unset, anonymous access is allowed and a warning is logged (dev only) |
| `SECRETS_API_URL` | — | Optional. When set, every `conv_<id>` request checks membership via `GET /v1/conversations/:id` using the caller's token |
| `ROOM_EMPTY_TIMEOUT` / `ROOM_DEPARTURE_TIMEOUT` | `300` / `30` | Room lifetime, in seconds |
| `TOKEN_TTL` | `2h` | Join token lifetime |

## Endpoints

Every endpoint except `/health` requires `Authorization: Bearer <Secrets session token>`. The contract is in [`src/contract.ts`](src/contract.ts), a copy of `api.secrets/packages/shared/src/voice.ts`.

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/v1/rooms` | `{ conversation_id, kind: "voice"\|"video" }` | `VoiceRoom { room: "conv_<id>", url, token, kind }`. Creates or ensures the room |
| `POST` | `/v1/token` | `{ room, identity?, name? }` | `{ token, url, room }`. Identity is the JWT `sub` when authenticated |
| `GET` | `/v1/rooms/:room` | — | `{ room, participants }` |
| `GET` | `/health` | — | `{ ok, livekit_configured, auth: "jwt"\|"anonymous-dev", membership_check }` |

Errors use the shape `{ error, message }`:

| Status | Meaning |
|---|---|
| 400 | Bad input |
| 401 | Missing, invalid or expired session |
| 403 | Caller is not a member of the conversation |
| 502 | LiveKit or Secrets API is unreachable |
| 503 | LiveKit is not configured |

```ts
// web client
import { Room } from "livekit-client";
const { url, token } = await fetch(`${VOICE_URL}/v1/rooms`, { method: "POST", headers: { authorization: `Bearer ${session}`, "content-type": "application/json" }, body: JSON.stringify({ conversation_id, kind: "voice" }) }).then(r => r.json());
await new Room().connect(url, token);
```

[docs/LIVEKIT.md](docs/LIVEKIT.md) has the SDK details and sources.

## Deploying

The service is stateless, so Render, Railway, Docker and Vercel all work. On Vercel, `api/index.ts` wraps the Fastify app and `vercel.json` rewrites every path to it.

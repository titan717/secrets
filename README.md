<p align="center"><img src="assets/logo-mark-512.png" width="96" alt="Secrets logo"></p>

# Secrets

**Your world. Your people. Your space.**

Privacy-first, end-to-end encrypted, all-in-one app: Messages, Calls, Docks, Moments, Notes, Tasks and Vault — for web, Android, iOS and desktop. Dark-first, username-first, free-first.

> Status: Phase 1 in progress. See [docs/STATE.md](docs/STATE.md).

## Repo layout
| Path | What |
|---|---|
| `apps/api` | Modular-monolith backend (TypeScript, Postgres, Redis, WebSocket, S3) |
| `apps/web` | Web client (React + Vite) |
| `apps/mobile` | Expo / React Native shell |
| `apps/desktop` | Tauri desktop shell |
| `packages/protocol` | Shared wire types + validation |
| `packages/crypto` | Client E2EE wrapper over audited libraries |
| `packages/tokens`, `packages/ui` | Design tokens and shared UI kit |
| `docs/` | PRD, UX references, runtime, security, state |

## Develop
```bash
pnpm install
pnpm check     # typecheck + lint + test
```

## Security model (short)
The server stores only ciphertext and public key material. It never holds keys that decrypt private content and never logs plaintext. No custom cryptography. See [docs/security](docs/security).

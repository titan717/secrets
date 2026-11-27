# Security plan (MVP)

Status: proposed · Owner: backend · Reviewed against the master prompt §9

## 1. Position

MVP is **not** end-to-end encrypted and will not claim to be. The prior E2EE design
(`docs.secrets`, `secrets/docs/security/threat-model.md`) stays as the Phase-2 target; the message
envelope (`body` / `ciphertext` + `nonce`) already isolates content so encryption can be added without
an API break.

What we guarantee in MVP: transport encryption, server-side authorization on every access, no plaintext
secrets in logs/storage, and explicit disclosure of what reaches third parties.

## 2. Threat model (MVP)

| Threat | Vector | Control |
| --- | --- | --- |
| Account takeover via XSS | stolen token in localStorage | httpOnly + `Secure` + `SameSite=Lax` cookie; strict CSP; no `dangerouslySetInnerHTML` except sanitized Markdown |
| Credential stuffing | leaked password lists | bcrypt cost ≥ 11, generic errors, per-IP + per-account throttling, optional breach check (k-anonymity) |
| Brute force | login/reset/verify | fixed+sliding limits, exponential lockout, reset tokens single-use 30 min |
| Session fixation / theft | cookie reuse | new session id on login, rotate on privilege change, revoke-all on password reset, device list |
| CSRF | cross-site form posts | SameSite=Lax + `Origin` check + double-submit `X-CSRF-Token` on mutations |
| IDOR | guessed UUIDs | every handler resolves membership through `access()`; 404 not 403 for invisible resources |
| Privilege escalation | role fields from client | roles read from DB, `grant ≤ own role`, owner transfer audited |
| Private Dock leak | non-member reads channel | channel→dock membership check on REST, WS **and** call tokens |
| Malicious upload | SVG/HTML/polyglot, zip bomb | magic-byte sniff, allowlist, re-encode images, size cap, `Content-Disposition`, separate origin for media |
| SSRF | avatar-from-URL, AI tools | no server-side fetch of user URLs; AI tools use allowlisted hosts |
| SQL injection | query building | parameterized SQL only; no string interpolation of user input |
| XSS in messages | HTML payloads | render as text/sanitized Markdown; CSP without `unsafe-inline` |
| Prompt injection | Dock content → agent | tools are allowlisted, writes require explicit approval, context is user-selected |
| Secret leakage in logs | provider keys, tokens | redaction allowlist at logger level, keys never persisted server-side, CI secret scan |
| Enumeration | signup/reset/username lookup | uniform responses, rate limits, no email in errors |
| Call eavesdropping | room token for wrong room | fail-closed membership, room bound to conversation id, TTL ≤ 2 h |
| Abuse/spam | mass invites, message floods | per-user quotas, invite limits, report + mute |

## 3. Controls checklist

### Transport & headers
- [ ] HTTPS only, HSTS `max-age=31536000; includeSubDomains`
- [ ] CSP: `default-src 'self'; img-src 'self' data: blob: <media-host>; connect-src 'self' wss://<api> https://<ai>; frame-ancestors 'none'; object-src 'none'; base-uri 'none'`
- [ ] `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic only where needed)
- [ ] `X-Frame-Options: DENY`

### Authentication
- [ ] bcrypt cost 11–12 (or argon2id when a native build is available), rehash on login if cost changed
- [ ] Password policy: ≥ 10 chars, block top-10k list, no composition theatre
- [ ] Email verification before DMs to strangers; unverified accounts rate-limited harder
- [ ] Password reset: single-use hashed token, 30 min, revokes all sessions
- [ ] Session cookie `__Host-` prefix, 90-day sliding expiry, absolute 180-day cap
- [ ] Login/signup/reset rate limits in Redis (per IP + per account)
- [ ] Audit events for login, failed login burst, password change, session revoke

### Authorization
- [ ] Single `access(conversation, user, mode)` + `dockRole(dock, user)` helpers, unit-tested
- [ ] Route table test asserting every mutating route has auth + permission test
- [ ] Block/mute enforced in send and read paths
- [ ] Call tokens: membership required, fail closed

### Input & output
- [ ] Zod at every boundary; reject unknown keys
- [ ] Message length ≤ 8 000 chars, emoji ≤ 32, display name ≤ 48, about ≤ 160
- [ ] Markdown sanitized (no raw HTML, no `javascript:` links, `rel="noopener noreferrer"`)
- [ ] Upload: magic bytes, allowlist, 8 MB, re-encode, strip EXIF

### Secrets
- [ ] `.env` never committed; `.env.example` only
- [ ] `gitleaks` pre-commit + CI
- [ ] Separate credentials per environment; least-privilege DB user (no superuser)
- [ ] AI keys BYOK in browser; server logs redact `authorization`, `cookie`, `x-provider-key`, `x-github-token`
- [ ] Rotation runbook for JWT secret, LiveKit keys, storage keys

### Data
- [ ] TLS to DB and storage
- [ ] IP addresses stored only as HMAC with a server pepper
- [ ] Account deletion + export (30-day purge, immediate disable)
- [ ] Retention jobs per `schema.sql` footer
- [ ] Backups encrypted, restore tested quarterly

## 4. Fix list from the audit

| ID | Fix | Phase |
| --- | --- | --- |
| S1 | Session JWT out of localStorage → httpOnly cookie | P2 |
| S2 | Calls membership fail-closed; remove anonymous path | P5 |
| S3 | Authorization test suite (every route, every role) | P1–P4 |
| S4 | Upload magic-byte validation + re-encode + safe headers | P3 |
| S5 | Redis-backed rate limiting with in-memory dev fallback | P2 |
| S6 | helmet + CSP + clickjacking headers | P2 |
| S7 | Remove `x-secrets-token` or scope it to `/v1/ws` handshake only | P2 |
| S8 | WS auth via cookie; no token in query string | P2 |
| S9 | bcrypt cost 11 + rehash-on-login | P2 |
| S10 | Explicit CORS allowlist; never `origin: true` with credentials | P2 |

## 5. Verification

- **Unit**: permission matrix, token expiry/revocation, upload sniffing, Zod schemas.
- **Integration** (PGlite): two users, one private Dock — assert 403/404 on every cross-tenant read/write.
- **E2E** (Playwright on CI): signup → verify → DM → upload → Dock invite → call token → AI approval.
- **Manual**: OWASP ASVS L1 checklist before launch; `npm audit` + `osv-scanner` in CI.
- **Abuse**: load test message send/presence; rate-limit assertions.

## 6. Disclosure

- `/privacy` states what is stored, what is sent to AI providers (only the context the user selects),
  retention windows, and that MVP is **not** E2EE.
- Every AI run shows a "context sent" summary before the first token streams.

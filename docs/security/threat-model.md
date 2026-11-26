# Secrets — Threat Model (T-0007)

Owner: SECURITY-CRITIC · Status: v1 (2026-11-26) · Scope: P1 (signup, 1:1 E2EE chat, multi-device, media, abuse controls) with forward notes for groups, calls, recovery, Docks.
Inputs: `docs/PRD.md`, `docs/research/crypto-choice.md`, `docs/research/crypto-poc/*`, `docs/security/review-T-0001.md`.

Hard rules (non-negotiable; any diff violating one is **blocking**):
- R1 No custom crypto. Only audited libs (vodozemac, libsodium, `@node-rs/argon2`, LiveKit E2EE). App code orchestrates; it never implements a primitive, mode, KDF, MAC, or protocol state machine.
- R2 The server never holds a key that can decrypt private content (messages, attachments, Notes, Vault, call media, key backups).
- R3 No plaintext private content, keys, tokens, passwords or recovery material in logs, DB, backups, analytics, crash reports, error messages.
- R4 Removed devices / members receive no future keys (rotation is mandatory and tested).
- R5 Enumeration (username lookup, key bundle fetch, availability check, login) is rate-limited and privacy-controlled.

---

## 1. Assets

| ID | Asset | Where it lives | Confidentiality | Integrity | Availability |
|---|---|---|---|---|---|
| A1 | Message plaintext (1:1, group), reactions, edits, receipts content | Client only (decrypted), encrypted pickled sessions on device | Critical | Critical | High |
| A2 | Device identity keys (Curve25519 + Ed25519 private), Olm/Megolm session state (pickles) | Device secure storage (Keychain/Keystore; non-extractable WebCrypto key wrapping IndexedDB blobs) | Critical | Critical | High |
| A3 | Attachment / Vault / Notes per-object keys | Inside E2EE messages / encrypted manifests | Critical | Critical | Medium |
| A4 | Attachment ciphertext | S3 | Low (ciphertext) but size/count metadata | High | Medium |
| A5 | Public key directory (identity keys, signed OTKs, fallback keys, device list per user) | Server DB | Public | **Critical** (MITM if forged) | High |
| A6 | Account credentials (password, Argon2id hash, passkeys), session/refresh tokens | Client, server DB (hash only) | Critical | Critical | High |
| A7 | Recovery material (recovery key / passphrase, encrypted key backup blob) | User; server stores only ciphertext blob | Critical | Critical | Medium |
| A8 | Metadata: social graph (who↔who), timing, sizes, IPs, device count, online presence, group membership | Server DB, logs, LiveKit, S3 access logs, push providers | High | Medium | — |
| A9 | Call media + per-call/per-participant E2EE keys | Client; SFU sees encrypted frames only | Critical | High | High |
| A10 | Account identity: username ↔ stable internal ID mapping, profile | Server DB | Medium (username public by design; discovery controlled) | High | High |
| A11 | Build & release pipeline, dependency tree, signing keys | CI, npm, app stores | — | Critical | High |

## 2. Actors (adversaries)

| ID | Actor | Capabilities assumed | Goal |
|---|---|---|---|
| T1 | **Malicious / compelled server operator** (incl. insider, attacker with full server+DB+S3+LiveKit access) | Read/modify DB, S3, logs, backups; serve arbitrary key bundles and device lists; drop, delay, reorder, replay ciphertexts; mint auth tokens; control the SFU; ship a malicious **web** bundle | Read content, impersonate, inject a "ghost device", map social graph |
| T2 | Network attacker | Passive and active on-path; TLS-stripping attempts; can observe traffic sizes and timing | Read/modify traffic, correlate users |
| T3 | Stolen / seized device (locked and unlocked) | Physical access, filesystem extraction, possibly unlocked session | Read history, keep receiving new messages, impersonate |
| T4 | Malicious group member | Holds legitimate group keys; can send arbitrary ciphertext/plaintext, forge client-side metadata | Impersonate other members, DoS clients with malformed payloads, exfiltrate, harass |
| T5 | Removed member / revoked device | Kept all old keys and state; may still hold a valid token briefly | Read future messages, rejoin silently |
| T6 | Spammer / abuser / enumerator | Many accounts, scripted clients, IP rotation | Enumerate usernames/key bundles, spam message requests, exhaust OTKs, storage abuse |
| T7 | Compromised dependency / build | Malicious npm/crate release, CI action, wasm/native prebuilt | Exfiltrate keys from every client; weaken RNG |
| T8 | Curious recipient / ex-partner (social) | Legit access to a conversation | Screenshot, forward, abuse "disappearing" semantics (out of scope technically; UX disclosure only) |

Out of scope (documented, not mitigated): OS/kernel compromise of an unlocked device with root; hardware side channels; legal compulsion of the user; endpoint screenshots.

## 3. Trust boundaries

```
 [User] ─(UI)─► [Client app: RN / Web / Tauri]  ◄── TB1: device secure storage boundary (A2 lives here)
                     │  plaintext exists ONLY left of this line
 ════════════════════╪══════════════════════ TB2: E2EE boundary — everything right of this line sees ciphertext + metadata only
                     │ TLS 1.3 (TB3: network)
     ┌───────────────┼────────────────┬─────────────────┬───────────────┐
     ▼               ▼                ▼                 ▼               ▼
 [API Fastify]   [WS gateway]    [S3 / object store]  [LiveKit SFU]   [Push (APNs/FCM)]
     │  TB4: service ↔ DB/Redis     (presigned URLs)   (TB5: SFU sees SRTP + E2EE frames)   (TB6: 3rd party)
     ▼
 [Postgres + backups]  [Logs/metrics/Sentry]  ◄── TB7: ops/observability boundary (must never receive A1–A3, A6 secrets, A7)
 [CI / npm / crates / app stores] ◄── TB8: supply chain
```

Key consequence: **the server is trusted for availability and for nothing else.** In particular the server is *not* trusted for the key directory (A5) — the client must be able to detect a forged device/key.

Web caveat (TB8/T1): on the web client the server operator also serves the JavaScript. A malicious operator can ship a key-exfiltrating bundle; E2EE on web is therefore weaker than on installed apps. Mitigations in §5.10.

---

## 4. STRIDE per component

Legend: **M** = required mitigation (P1 unless marked), **RR** = residual risk accepted / tracked.

### 4.1 Auth (username, password Argon2id, sessions, passkeys P1+)

| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Credential stuffing, password spraying (T6) | M: per-username + per-IP + global rate limits with exponential backoff on `/login`; uniform error "invalid username or password"; constant-time path (always run Argon2 verify against a dummy hash when user missing). Breached-password check client-side (k-anon) optional P2. |
| S | Session token theft (T2/T3) | M: opaque random 256-bit tokens, stored server-side **hashed** (SHA-256); short-lived access (≤15 min) + rotating refresh with reuse detection → revoke family; tokens bound to `device_id`; `HttpOnly; Secure; SameSite=Strict` cookies on web or memory-only bearer; never in URLs or logs. |
| T | Hash parameter downgrade | M: Argon2id m≥19456 KiB, t≥2, p=1 (OWASP floor), params stored in PHC string; rehash on login if below current policy. |
| R | User disputes login / device add | M: append-only security event log (login, device add/remove, password change, recovery use) visible to the user; contains IDs + timestamps, no secrets. |
| I | Username enumeration via signup/login/availability (T6) | M: availability endpoint rate-limited (per IP + per account + global), requires proof-of-work or captcha after threshold; login does not reveal existence; timing equalized. RR: availability check inherently reveals existence — accepted; rate-limit is the control. |
| I | Password reuse as E2EE secret | M: the account password **must never** be the input to any client-side KEK. If a single user secret is ever used for both, the client derives two keys with domain separation *before* anything is sent and the server only receives the auth derivative (prefer OPAQUE P2). Default: separate recovery key. |
| D | Argon2 CPU/memory exhaustion (T6) | M: rate limit **before** hashing; cap concurrent hash jobs (worker pool / semaphore); max password length (e.g. 1024 bytes). |
| E | Mass assignment / IDOR on account endpoints | M: authz checks derive user from token, never from body; schema validation (zod/typebox) with `additionalProperties:false`. |

### 4.2 Devices & key directory (the highest-value server component)

| STRIDE | Threat | Mitigation |
|---|---|---|
| S | **Server injects a ghost device** into a user's device list or swaps an identity key → sender encrypts to attacker (T1) | M (P1, blocking for GA): (a) each device uploads a **self-signed device-key object** (Ed25519 over canonical JSON of user_id, device_id, curve25519, ed25519, algorithms); clients verify signature. (b) **Safety numbers** per contact derived from both users' identity material, with QR/compare UI. (c) **TOFU pinning + key-change warnings**: client pins first-seen identity per contact; any new/changed device or key shows a visible notice in the conversation and — for verified contacts — blocks sending until re-verified. (d) **Cross-signing (P1 for multi-device)**: a user-level master signing key (held only on the user's devices / recovery) signs each new device; other users trust devices signed by the pinned master key, so adding a device by the user does not spam warnings, but a server-added device is unsigned → warned/blocked. RR: unverified users rely on TOFU → first-contact MITM by the server is possible and undetectable until verification. Key transparency (verifiable log, P2) reduces this. |
| S | Device registration without user consent (stolen password) | M: adding a device requires (password + existing-device approval **or** recovery key) to obtain cross-signing; a device not cross-signed is shown as "unverified" to contacts. Notify all existing devices on add. |
| T | Server replays / reuses one-time keys, or serves the fallback key only | M: OTKs signed by device Ed25519 key, verified by client; server deletes OTK atomically on claim (`DELETE … RETURNING` in one tx); fallback key used only when OTKs exhausted; clients replenish OTKs; RR: fallback reuse lowers forward secrecy of the *first* message only. |
| R | — | M: device add/remove are security events (4.1 R). |
| I | Key bundle fetch reveals who is contacting whom; device count leaks | M: bundle fetch requires auth, rate-limited per requester and per target (anti-enumeration, anti-OTK-exhaustion); no unauthenticated fetch. RR: server learns that A fetched B's keys (metadata). |
| D | OTK exhaustion by spammer (T6) | M: per-requester/target claim limits; fallback key; message-request gating for non-contacts. |
| E | Revoked device keeps fetching / sending | M: device revocation invalidates all tokens for that device immediately (server-side), removes it from directory, and triggers Megolm rotation in every group it was in (R4). Revoked device's ciphertexts rejected by server; clients drop messages from devices not in the current signed list. |

### 4.3 Messaging transport (envelopes, fan-out, offline queue)

| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Server forges sender metadata (`from_user`, `from_device`) | M: recipient authenticates sender from **crypto**, not envelope: Olm decryption yields `senderIdentityKey`; client must check it equals the pinned key of the claimed `from_device`; mismatch → drop + security warning. Inner plaintext payload carries sender user_id/device_id and recipient ids, signed/bound inside ciphertext, checked against envelope. |
| T | Modify ciphertext | Olm/Megolm AEAD/MAC (library). M: client never "partially" renders on decrypt failure. |
| T | Replay / reorder / drop (T1) | M: Olm ratchet rejects replays; **Megolm: app MUST track `(sessionId, messageIndex)` and reject duplicates** (binding explicitly delegates this); client-generated message UUID inside ciphertext for idempotent dedupe; ordering = server sequence for display + per-sender counters inside ciphertext to detect gaps. RR: server can silently drop/withhold messages (censorship) — detectable only via per-sender gap detection, P2 UI. |
| R | Sender repudiation | By design Olm is deniable; we do not promise non-repudiation. |
| I | Plaintext leaks via server: logs, DB, push, previews, search | M: envelopes are opaque `bytea`/base64; server never parses inner payload; request/response body logging **disabled** on message, key, backup, attachment routes (redaction at logger level, allowlist fields); push payloads contain no content (notification-only "new message" with ciphertext or wake-up, decrypt in Notification Service Extension / headless task); link previews generated **client-side** by the sender only (P1 off by default). |
| I | Metadata: who talks to whom, when, size, frequency (T1/T2) | M: minimize retention (delete delivered envelopes after all target devices ack + max TTL e.g. 30 days); pad ciphertext to buckets (e.g. 256 B multiples) at application layer **using library-encrypted payloads** (padding is inside plaintext, not crypto); no IP in message rows; IP logs short-lived (≤7 days) and separate. RR: server sees sender account, recipient devices, timing → social graph. **Sealed sender is P2** (sender certificate + anonymous delivery token); until then, document in privacy policy. |
| D | Flood / huge envelopes | M: max envelope size, max recipients per send, per-account send rate, message-request quota for non-contacts (MSG-020). |
| E | Send to devices of a user who blocked you; inject into others' conversations | M: server enforces block list and message-request state before fan-out; recipient device list comes from server but each recipient device is validated client-side (4.2). |

### 4.4 Attachments / S3 / Vault

| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Attacker swaps attachment object at same key | M: per-file random key + `crypto_secretstream_xchacha20poly1305` (libsodium) → AEAD; message carries key, header, **SHA-256 of ciphertext**, size; client verifies hash before decrypt and requires `TAG_FINAL` on last chunk (truncation detection). |
| T | Truncation / chunk reorder | secretstream tags + FINAL check (M: test). |
| I | Server reads attachments | Encrypted client-side before upload (R2). M: no server-side thumbnails/transcoding/virus scan of plaintext; thumbnails generated by sender, encrypted with the same file key (separate object). Original filename, MIME, dimensions travel **inside** the E2EE message, never as S3 metadata or object key. Object key = random UUID. |
| I | Presigned URL leakage / guessing | M: short TTL (≤5 min upload, ≤15 min download), scoped to one object + method + content-length-range; bucket private, no listing, block public access; object key unguessable (128-bit random). RR: anyone with URL + message key can decrypt; URL alone yields ciphertext only. |
| I | Size/timing metadata | RR: size visible; pad to buckets P2. |
| D | Storage abuse, upload bombs | M: content-length-range in presign, per-user quota, orphan GC (uploads never referenced within 24 h deleted), lifecycle expiry for chat attachments. |
| E | Download others' attachments | M: download presign only issued if requester's device is a recipient of a message referencing the object (or shared-Vault ACL). |
| — | Backups | S3 ciphertext only; R3 checks: S3 access logs contain no query-string secrets beyond presign signature (rotate keys). |

### 4.5 WebSocket gateway

| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Unauthenticated / cross-site WS (CSWSH) | M: auth on upgrade via short-lived ticket (single-use, ≤60 s, bound to device) obtained over HTTPS — **not** a long-lived token in the query string (query strings end up in logs); validate `Origin` against allowlist. |
| T | Message injection by another connection | M: server only pushes envelopes addressed to the authenticated `device_id`; client still verifies crypto (4.3). |
| R | — | — |
| I | Presence/typing leaks (P1 MSG-013) | M: typing indicators are E2EE payloads, not server events; presence opt-in, shared only with contacts. |
| D | Connection floods, slowloris, oversized frames | M: max frame size, per-IP/per-account connection caps, heartbeat timeouts, backpressure. |
| E | Revoked device keeps socket open | M: revocation closes all sockets for that device and session family immediately (pub/sub kill). |

### 4.6 Calls / LiveKit SFU

| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Server adds a hidden participant to the room (it mints JWTs) (T1) | M: media keys are distributed **only over Olm to devices the caller has verified/pinned** — never "everyone in the LiveKit room". Clients display participant list derived from the E2EE key-exchange, and flag any LiveKit participant that never received a key. A hidden participant gets encrypted frames only. |
| S | Participant impersonation inside call with shared key (T4) | M: use **per-participant keys** (`ExternalE2EEKeyProvider` with `sharedKey:false`), each sender's key delivered over Olm and bound to sender's device identity. RR: LiveKit frame encryption has no per-frame sender signatures; a participant holding another's key could forge frames — acceptable for P1 calls (≤ small groups); revisit with SFrame/MLS P2. |
| T | Downgrade to non-E2EE room | M: client refuses to publish/subscribe if E2EE not enabled on the room and key not set; UI shows E2EE state; no fallback path. |
| I | SFU sees metadata (who, when, duration, IP, bitrate/VAD side channels) | RR documented. M: no egress/recording/transcription/agents on E2EE rooms (would require keys, violates R2); LiveKit logs retention minimal; TURN credentials short-lived. |
| I | Keys in JWT/room metadata | M: forbidden (checklist). |
| D | Room floods | M: JWT minted only for call participants (authz from conversation membership), short TTL, room caps. |
| E | Removed member stays in call | M: on leave/removal, rotate keys for remaining participants (R4) and kick from room. |

### 4.7 Recovery & key backup

| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Server-side "reset" grants a new device the old keys (T1 / social engineering) | M: server-side account recovery (email/phone, ID-009/010) restores **account access only**, never keys. History/keys come back only with the **recovery key** (client-side). After server-side reset the account gets a **new master identity** → all contacts see key-change warning. This is the honest trade-off and must be stated in UI. |
| T | Tamper with encrypted backup blob | M: backup = libsodium AEAD (`crypto_aead_xchacha20poly1305_ietf` / secretbox) with key derived from recovery key; versioned header; client verifies on restore. |
| I | Offline brute force of backup by server (T1) | M: default **random recovery key** (≥128-bit, e.g. 24-word / base58) — not user-chosen. If a passphrase option is offered: Argon2id via `crypto_pwhash` with ≥ MODERATE (256 MiB, ops 3) on capable devices, per-user random salt, minimum strength check (zxcvbn ≥3). RR: weak passphrases remain brute-forceable by the server — warn. |
| I | Recovery email/phone links identity to real world | M: optional, stored hashed+encrypted where possible (encrypted at rest with server KMS — this is *not* private content); clear disclosure. |
| D | Lockout attacks via recovery flow | M: recovery attempts rate-limited, notify all devices, 24 h delay + cancel option for email/phone reset (P1). |
| E | Recovery code reuse | M: recovery verifier (if any) on server is a hash of a *separate* auth derivative — never of the KEK material. |

### 4.8 Client storage (all platforms)
- M: Olm/Megolm pickles are **plaintext JSON** from the binding → encrypt every pickle and the local message DB with a device storage key: RN = key in Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) / Android Keystore-wrapped; Web = non-extractable AES-GCM WebCrypto key in IndexedDB wrapping a libsodium key; Tauri = OS keychain. Wrapping/unwrapping uses WebCrypto/OS APIs or libsodium only.
- M: no keys in `localStorage`, AsyncStorage, Redux persist, logs, crash breadcrumbs. Disable screenshots in sensitive screens optional (Android `FLAG_SECURE` P1 setting).
- M: app-lock (biometric/PIN) optional P1; remote device revoke wipes local store on next launch.
- RR (T3 unlocked device): attacker reads everything visible; mitigated only by revoke-from-other-device + rotation.

---

## 5. Cross-cutting mitigations

5.1 **Logging (R3)**: structured logger with a strict field allowlist; request bodies never logged; redact `authorization`, `cookie`, `password`, `token`, `ticket`, `ciphertext`, `body`, `key*`, `recovery*`, presigned URLs; error handlers return generic messages; Sentry `beforeSend` scrubbing; CI test that greps logs from the full e2e suite for seeded canary plaintext/passwords (must be 0 hits).
5.2 **DB/backups (R3)**: message/attachment/backup columns are ciphertext (`bytea`); CI test dumps PGlite DB after e2e run and asserts canary plaintext absent. Server-side at-rest encryption (KMS) for metadata is defence-in-depth, not a substitute for R2.
5.3 **Rate limiting (R5)**: central limiter (Redis/PG token bucket) keyed by IP, account, device, and target; documented limits per endpoint; 429 with `Retry-After`; tests for each sensitive endpoint.
5.4 **Input validation**: every endpoint schema-validated; size caps; base64 decoding with length checks **before** passing to the crypto lib (defence against GHSA-pqp6-f7wc-6498-class panics).
5.5 **Transport**: TLS 1.3, HSTS preload, no mixed content; certificate pinning for mobile optional P2 (risk of bricking).
5.6 **Headers/web**: strict CSP (`script-src 'self'` + `'wasm-unsafe-eval'`, no inline), `Trusted-Types`, COOP/COEP as needed, `frame-ancestors 'none'`, SRI on any third-party script (prefer none).
5.7 **Supply chain (T7)**: lockfile committed; `pnpm install --frozen-lockfile --ignore-scripts` in CI with explicit allowlist for packages that need install scripts (e.g. `react-native-libsodium` postinstall); crypto deps pinned exact version + integrity; Renovate with manual review for crypto packages; `npm audit signatures` / provenance check in CI; GitHub Actions pinned by SHA; own fork + CI build of vodozemac bindings (see review-T-0001).
5.8 **Rotation policy (R4)**: Megolm outbound session rotated on any membership/device change, and every 100 messages or 7 days; tests that a removed device fails to decrypt post-rotation; new members get keys only from current index forward (no `exportAt` history sharing unless explicit, P2 policy).
5.9 **Abuse without plaintext**: block, message requests for non-contacts, per-account send quotas, report = reporter's client **voluntarily** re-encrypts/forwards the reported messages to the moderation key (franking P2). Server never gets a content backdoor.
5.10 **Web client integrity (T1)**: label web as "less protected than apps" in security docs; reproducible static build, published hashes, SRI on chunks; P2: browser extension or Tauri as recommended desktop path; Service Worker pinning considered but not relied on.

## 6. Residual risks register

| ID | Risk | Severity | Status / plan |
|---|---|---|---|
| RR1 | Server-controlled key directory; TOFU first-contact MITM for unverified contacts | High | Safety numbers + key-change warnings + cross-signing in P1; key transparency log P2 |
| RR2 | Metadata exposure (social graph, timing, sizes, IPs) to server, SFU, push providers | High | Minimize retention, padding; sealed sender P2; publish in privacy policy |
| RR3 | Web bundle served by operator can exfiltrate keys | High | Disclose; reproducible builds + hashes; prefer installed apps |
| RR4 | Single-maintainer, young (Aug 2026) JS/RN binding for vodozemac; pins vodozemac 0.10.0 with known medium advisory | High → Medium after fork | See review-T-0001 conditions C1–C4 |
| RR5 | Megolm: weaker FS/PCS than MLS for groups; O(n) key distribution on removal | Medium | Rotation policy; OpenMLS for large groups/Docks P2 |
| RR6 | LiveKit E2EE lacks per-frame sender authentication | Medium | Per-participant keys; small calls only in P1; re-evaluate P2 |
| RR7 | Server can drop/delay messages (censorship) | Medium | Gap detection P2 |
| RR8 | Weak user-chosen recovery passphrase brute-forceable offline | Medium | Default random recovery key; passphrase opt-in with strength gate |
| RR9 | Fallback key reuse reduces FS of first message | Low | Keep OTK pool filled |
| RR10 | Server-side account reset = new identity (UX friction, social-engineering target) | Medium | Delay + notifications + key-change warning |
| RR11 | libsodium audit is from 2017 (v1.0.12) | Low | Widely deployed; track advisories |
| RR12 | vodozemac public audit (2022) predates 0.10/0.11 changes (HPKE, zeroization fixes) | Low–Medium | Track upstream; Element X production use; re-check before GA |

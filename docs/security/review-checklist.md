# Security review checklist (crypto / auth / data-path diffs)

Applied by SECURITY-CRITIC to every diff touching: `packages/crypto*`, auth, sessions, devices/key directory, messaging/WS, attachments/S3, calls, recovery, logging, DB schema, CI/deps.
Run: `git -C <worktree> diff main...HEAD`, then walk this list. Each finding is recorded in `docs/security/review-<T-id>.md` as **BLOCKING** (violates a hard rule R1–R5 or an item marked ★) or **NON-BLOCKING**, with `file:line`.

## 0. Hard rules (any ✗ = BLOCKING)
- [ ] ★ R1 No custom crypto. No hand-rolled primitives, modes, KDF/HKDF chains, MACs, padding-oracle-prone constructions, ratchets, `Math.random`, or `crypto.createCipheriv` used in ad-hoc ways for private content. Only vodozemac, libsodium, WebCrypto (for key wrapping only), `@node-rs/argon2`, LiveKit E2EE.
- [ ] ★ R2 The server never receives or stores a key, passphrase, KEK or unwrapped pickle that decrypts private content. Grep for `sessionKey`, `pickle`, `secret`, `privateKey`, `recovery` in server code and API payloads.
- [ ] ★ R3 No plaintext, keys, tokens, passwords or presigned URLs reach logs, DB, error messages, analytics or crash reports.
- [ ] ★ R4 Removing a device or member triggers rotation and stops future key shares. A test proves the removed party fails to decrypt.
- [ ] ★ R5 Lookup, availability, login, key-bundle and OTK-claim endpoints are rate-limited (per IP + account + target), with tests.

## 1. Dependencies & build
- [ ] New or changed deps: exact version, lockfile updated, license compatible (no AGPL/GPL in shipped code), maintained, provenance or attestation where available.
- [ ] No new install/postinstall scripts without allowlist justification.
- [ ] Crypto deps unchanged, or the bump is reviewed (changelog plus advisories). vodozemac ≥ 0.11.2.
- [ ] CI: actions pinned by SHA. No secrets exposed to `pull_request` from forks. No `pull_request_target` with checkout of PR code.

## 2. Crypto usage (client)
- [ ] Every randomness source is CSPRNG (`sodium.randombytes_buf`, `crypto.getRandomValues`). No `Math.random`/`uuid v1` for secrets or IDs that must be unguessable.
- [ ] libsodium: correct API family (`secretstream` for files and checks `TAG_FINAL`; `aead_xchacha20poly1305_ietf` with random 24-byte nonce per message; never reuses nonce with the same key). Keys come from `*_keygen`.
- [ ] Decrypt failures: no partial plaintext rendered, error not leaking key/state, no oracle (uniform error to remote).
- [ ] Olm: `senderIdentityKey` compared to the pinned key of the claimed device. OTKs and fallback keys signature-verified before use. Device-key objects self-signed and verified.
- [ ] Megolm: room key accepted only via Olm from the session owner. `(sessionId → sender, conversation)` binding enforced. Replay table `(sessionId, messageIndex)`. Rotation policy (membership change, 100 msgs, 7 days). No `exportAt` history sharing unless the spec allows it.
- [ ] Inner payload binds sender/recipient/conversation IDs and a message UUID. Envelope metadata is cross-checked against it.
- [ ] Remote base64 and keys are length-validated before reaching the binding (panic/DoS class).
- [ ] Pickles and local DB encrypted at rest with a device storage key from Keychain/Keystore/non-extractable WebCrypto. Nothing sensitive in localStorage/AsyncStorage/redux-persist.
- [ ] Key-change / new-device events surface a user-visible warning. Verified contacts block send until re-verified.
- [ ] Secrets zeroed or dropped promptly where the API allows (`sodium.memzero`). No secret in long-lived JS globals beyond need.

## 3. Auth & sessions (server)
- [ ] Argon2id via `@node-rs/argon2`, params ≥ m=19456 KiB, t=2, p=1. Rehash-on-login if below policy. Max password length. Hashing behind rate limit and concurrency cap.
- [ ] Unknown user takes the same path and timing (dummy verify). Errors don't reveal account existence.
- [ ] Tokens: ≥256-bit random, stored hashed. Short access TTL. Rotating refresh with reuse detection. Bound to device. Revocation is immediate (HTTP + WS).
- [ ] Web cookies `HttpOnly; Secure; SameSite=Strict`, or bearer tokens kept in memory. CSRF considered. No tokens in URLs or query strings (WS uses a single-use ticket).
- [ ] Authz derives identity from the token only. Every resource access checks ownership/membership (IDOR). Schemas use `additionalProperties:false` and size caps.
- [ ] Usernames: normalization (NFKC + case-fold), confusables policy, reserved names, rate-limited availability.
- [ ] Device add/remove, password change and recovery use emit security events and notify other devices.

## 4. Data path & storage
- [ ] DB columns for content/keys/backups are opaque ciphertext. No server-side parsing of inner payloads. Migrations don't add plaintext content columns.
- [ ] Logger: field allowlist and redaction (`authorization`, `cookie`, `password`, `token`, `ticket`, `ciphertext`, `body`, `key*`, `recovery*`, presigned URLs). Request body logging off on sensitive routes. Error handler returns generic messages.
- [ ] Canary test: e2e run seeds known plaintext/password. Logs and DB dump are asserted to contain 0 hits.
- [ ] Retention: delivered envelopes deleted after ack or TTL. IP logs short-lived and separate from message rows.
- [ ] Push payloads contain no content or sender name in clear.

## 5. Attachments / S3
- [ ] Encrypted client-side before upload. Message carries key, header, ciphertext SHA-256 and size. Client verifies hash and FINAL tag.
- [ ] Object key random (≥128-bit). Filename/MIME/dimensions only inside E2EE payload. No plaintext S3 metadata.
- [ ] Presign: short TTL, single object, method-scoped, `content-length-range`, per-user quota. Download presign only for authorized recipients. Bucket private.
- [ ] No server-side thumbnailing/scanning of plaintext. Orphan GC.

## 6. WebSocket
- [ ] Auth on upgrade via single-use short ticket. Origin allowlist. Frame size and connection caps. Heartbeat. Delivers only to the authenticated device. Closed on revoke.

## 7. Calls / LiveKit
- [ ] E2EE mandatory (client refuses otherwise). Per-participant keys via Olm to pinned devices only. Rotation on leave/join.
- [ ] No keys in JWT or room/participant metadata. JWT minted only for conversation members, short TTL. No egress/recording/agents on E2EE rooms.

## 8. Recovery
- [ ] Server-side reset restores access only, never keys, and forces a new identity plus contact warnings.
- [ ] Default recovery key random ≥128 bit. Passphrase path Argon2id ≥ MODERATE with strength gate. Backup AEAD with versioned header.
- [ ] Recovery attempts rate-limited, notified, delayed.

## 9. Tests required with the diff
- [ ] Negative tests: wrong key, tampered ciphertext, replayed Megolm index, removed device post-rotation, unsigned/forged device key, sender-key mismatch, 429 on each limited endpoint, unauthorized attachment download, revoked token on HTTP + WS.
- [ ] No test or fixture commits real secrets. Test keys generated at runtime.

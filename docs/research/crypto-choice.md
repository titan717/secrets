# T-0001 — Crypto library choice

Status: **Recommendation** (RESEARCHER, 2026-11-26). Hard rule respected: audited libraries only, no custom crypto, server never holds decryption keys. All npm versions checked live with `npm view` on 2026-11-26.

## TL;DR

| Area | Decision | Package(s) @ version | License |
|---|---|---|---|
| 1:1 + multi-device + groups | **vodozemac (Olm + Megolm)** — audited Rust core, wasm for web/Node, UniFFI for RN | `@kinsh/vodozemac-wasm@0.4.2` (web/Node/Tauri webview), `@kinsh/vodozemac-rn@0.2.2` (RN new-arch) — **fork into our org before beta** (see risks) | Apache-2.0 |
| Future group protocol | **OpenMLS** (audited 2026) once we need large groups / efficient removal; not v1 | Rust crate `openmls` 8.1+; no first-party npm | MIT |
| Primitives (attachments, Vault, Notes, backup KDF) | **libsodium** | `libsodium-wrappers-sumo@0.8.4` (web/Node), `react-native-libsodium@1.7.0` (RN, same API) | ISC / MIT |
| Server password hashing | **`@node-rs/argon2@2.2.2`** (Argon2id) | prebuilt napi binaries per platform, no node-gyp | MIT |
| Calls | **LiveKit** self-hosted SFU + built-in E2EE, keys distributed by us over Olm | `livekit-client@2.25.0`, `@livekit/react-native@3.2.0`, server `livekit/livekit` | Apache-2.0 |
| Test DB | **PGlite** + `pglite-socket` so the real `pg` driver / Kysely `PostgresDialect` are exercised | `@electric-sql/pglite@0.6.0`, `@electric-sql/pglite-socket@0.3.0`, `kysely`, `pg` | Apache-2.0 / PostgreSQL |

Proven in Node 20 (scratch dir, not repo): see [`crypto-poc/`](./crypto-poc/) — `roundtrip.mjs`, `primitives.mjs`, `run-output.txt`. All assertions pass.

## 1. E2EE messaging protocol

| Candidate | npm / version | License | Audit | Browser | RN | Node | Groups / removal | Verdict |
|---|---|---|---|---|---|---|---|---|
| **libsignal** (`@signalapp/libsignal-client`) | 0.108.7 | **AGPL-3.0-only** ([repo](https://github.com/signalapp/libsignal)) | Signal Protocol well studied; no public lib audit report | **No** — Node native addon, prebuilt only for Win/macOS/Debian Linux ([README](https://github.com/signalapp/libsignal/blob/main/README.md)); wasm not supported ([issue #350](https://github.com/signalapp/libsignal/issues/350)) | **No** npm build | Yes | Sender keys; Signal's own group logic not exposed | **Reject**: AGPL (network-use copyleft over our whole client/server), "use outside of Signal is unsupported", no browser/RN |
| **vodozemac** (Olm/Megolm, Rust) | crate 0.11.2 ([crates.io](https://crates.io/crates/vodozemac)); JS via bindings below | Apache-2.0 | **Least Authority 2022**, 10 concerns, 8 fixed in audit, "no significant findings" ([report PDF](https://leastauthority.com/static/publications/LeastAuthority-Matrix_vodozemac_Final_Audit_Report.pdf), [Matrix blog](https://www.matrix.org/blog/2022/05/16/independent-public-audit-of-vodozemac-a-native-rust-reference-implementation-of-matrix-end-to-end-encryption/)); used in production by Element X | via wasm | via UniFFI | via wasm | Megolm: per-sender ratchet; key shared over per-device Olm; **removal = rotate** (new outbound session, share only to remaining devices) | **Choose** |
| `@kinsh/vodozemac-wasm` / `-rn` (bindings) | 0.4.2 / 0.2.2 | Apache-2.0 | glue only (core audited) | Yes | Yes (RN ≥0.76 new arch) | Yes | Olm + Megolm v1 | Use now, fork before beta. Repo [Meneleus/vodozemac-bindings](https://github.com/Meneleus/vodozemac-bindings): single maintainer, 0 stars, pins vodozemac 0.10 (latest 0.11.2). Forked from [dTelecom/vodozemac-wasm](https://github.com/dTelecom/vodozemac-wasm) |
| `@matrix-org/matrix-sdk-crypto-wasm` | 19.0.1 | Apache-2.0 | built on vodozemac | Yes | No official JS for RN (Rust FFI is Swift/Kotlin) | Yes | Full Matrix room-key logic | Reject for us: first-party & well maintained, but it is a full Matrix `OlmMachine` (Matrix user/device IDs, to-device events, Matrix HTTP request shapes). Fallback if bindings fork fails |
| Other vodozemac JS bindings | `@towns-protocol/vodozemac` 0.1.0, `vodozemac-wasm-bindings` 0.8.1, [uhoreg/vodozemac-wasm](https://github.com/uhoreg/vodozemac-wasm) | Apache-2.0 | glue | Yes | No | Yes | — | Upstream [matrix-org/vodozemac-bindings](https://github.com/matrix-org/vodozemac-bindings) is unmaintained (per [npm readme](https://registry.npmjs.org/vodozemac-wasm-bindings)); none covers RN |
| **OpenMLS** (MLS RFC 9420) | Rust; only third-party wasm wrappers on npm (`openmls-wasm` 0.1.0, app-specific SDKs) | MIT | **SRLabs 2026** (Sovereign Tech Agency): 8 issues, 1 High, fixed in 8.1 / 7.3 ([blog](https://blog.openmls.tech/posts/2026-05-27-independent-audit/), [report](https://blog.openmls.tech/SRL-OpenMLS_security_assurance_assessment.pdf)); ongoing DoS advisories ([security](https://github.com/openmls/openmls/security)) | would need our own wasm build | own UniFFI build | own build | Native: Remove commit → new epoch, O(log n) | **Phase 2 candidate** for big groups/Docks. No maintained JS package today = too slow for v1 |
| **ts-mls** | 1.6.4 | MIT | **Not audited** — stated by author ([repo](https://github.com/LukaJCB/ts-mls), [SECURITY](https://github.com/LukaJCB/ts-mls/security)) | Yes | Yes (pure TS) | Yes | MLS | **Reject** (violates "audited only") |
| `@matrix-org/olm` (libolm) | 3.2.15 | Apache-2.0 | — | — | — | — | — | **Reject**: EOL since 2023 with known CVEs ([dTelecom note](https://github.com/dTelecom/vodozemac-wasm)) |

### Protocol shape we get (what builders implement — orchestration only, no crypto)
- Each **device** = one vodozemac `Account` (Curve25519 identity + Ed25519 signing key). Server stores only public identity keys, signed one-time keys and a fallback key per device.
- 1:1: sender fans out one Olm `Session` per recipient device **and** per own other device (multi-device = just more devices).
- Groups: each sender has a Megolm `GroupSession`; its `sessionKey()` is sent over Olm to every member device. **On member/device removal (and periodically, e.g. 100 msgs / 7 days) rotate**: discard the outbound session, create a new one, share only to remaining devices. Proven in PoC: removed device cannot decrypt after rotation.
- Persistence: `pickle()` output is **plaintext JSON** ([lib.rs](https://github.com/Meneleus/vodozemac-bindings)) — we must encrypt pickles at rest with libsodium `crypto_secretbox` using a device storage key (Keychain/Keystore on RN, non-extractable WebCrypto key + IndexedDB on web).
- Device verification / cross-signing and key backup are app logic on top (Ed25519 `sign()` + libsodium); keep it minimal and reviewed.

## 2. Primitives — libsodium
- License ISC ([libsodium.js](https://github.com/jedisct1/libsodium.js)); audited by Cryptography Engineering (Matthew Green) for PIA, v1.0.12/1.0.13, "no critical flaws" ([PIA results](https://www.privateinternetaccess.com/blog/libsodium-audit-results/), [report PDF](https://www.privateinternetaccess.com/blog/wp-content/uploads/2017/08/libsodium.pdf)). Old audit but libsodium is the most widely deployed portable crypto lib.
- Web/Node: `libsodium-wrappers-sumo@0.8.4` (sumo needed for `crypto_pwhash` Argon2id). RN: `react-native-libsodium@1.7.0` (MIT, [serenity-kit](https://github.com/serenity-kit/react-native-libsodium)), same API surface as libsodium-wrappers.
- Uses: attachments + Vault files = `crypto_secretstream_xchacha20poly1305` with a random per-file key (key travels inside the E2EE message / Vault manifest); Notes = `crypto_aead_xchacha20poly1305_ietf`; key backup KEK = `crypto_pwhash` Argon2id (MODERATE or higher). Proven in PoC.

## 3. Server password hashing
| | `argon2` 0.45.2 | `@node-rs/argon2` 2.2.2 |
|---|---|---|
| License | MIT ([node-argon2](https://github.com/ranisalt/node-argon2)) | MIT ([napi-rs/node-rs](https://github.com/napi-rs/node-rs)) |
| Binaries | node-gyp-build prebuilds, falls back to compile | per-platform optionalDependencies (linux gnu/musl x64/arm64, darwin, win, freebsd, android) — no toolchain |
| Pick | | **this** (proven; Argon2id m=19456 t=2 p=1 = OWASP minimum) |

Note: with username-first + E2EE, the account password must never double as the key-backup passphrase without a separate client-side KDF; the server only ever sees an auth secret.

## 4. Calls — LiveKit
- Server `livekit/livekit` Apache-2.0 ([repo](https://github.com/livekit/livekit)), self-hostable single Go binary (no Docker needed for dev). E2EE is "full support" on self-hosted ([docs](https://docs.livekit.io/llms-full.txt), [security overview](https://livekit.com/security/overview)).
- E2EE encrypts media frames (AES-GCM, insertable streams / encoded transform, frame-level like SFrame) and data channels; "no intermediaries (including LiveKit servers) can access" ([encryption overview](https://docs.livekit.io/transport/encryption/)). SDKs: web `livekit-client@2.25.0` (worker `livekit-client/e2ee-worker`), RN `@livekit/react-native@3.2.0` (`useRNE2EEManager`) ([get started](https://docs.livekit.io/transport/encryption/start/)) — both Apache-2.0.
- **Key distribution is ours**: generate a per-call random key on the caller, send it to participants' devices over Olm/Megolm; rotate on leave/join (use per-participant keys via the external key provider rather than one shared passphrase). Never put keys in the LiveKit JWT/metadata. Do not use server-side egress/recording/agents on E2EE rooms (they would need the key).

## 5. Test DB — PGlite
- Dual Apache-2.0 / PostgreSQL license ([repo](https://github.com/electric-sql/pglite)).
- `kysely-pglite@0.6.1` is stale (last publish 2024) — **don't use**. Instead run `@electric-sql/pglite-socket` (`PGLiteSocketServer` on a local port) and connect with the **real `pg` Pool + Kysely `PostgresDialect`** — same driver as prod. Caveat: pglite-socket serves one connection at a time → `pg.Pool({ max: 1 })`, one PGlite per test file.
- Drizzle alternative: `drizzle-orm@0.45.4` has a native `drizzle-orm/pglite` driver (also proven). Either works; pick by backend team's ORM choice.

## License risks
1. **AGPL**: avoid `@signalapp/libsignal-client` entirely (would force source release of the networked service and conflicts with app-store terms).
2. Everything chosen is Apache-2.0 / MIT / ISC / PostgreSQL — permissive; keep NOTICE files for Apache-2.0 deps (vodozemac, LiveKit, PGlite).
3. **Supply-chain (not license) risk**: `@kinsh/vodozemac-*` is a one-person binding. Mitigation (task for a builder): fork to `titan717/vodozemac-bindings`, bump to vodozemac 0.11.x, build wasm + RN in our CI, pin by integrity hash. Binding code is thin glue (no crypto logic), so this stays within the "no custom crypto" rule. Fallback: `@matrix-org/matrix-sdk-crypto-wasm` (first-party, web/Node only).

## PoC (Node 20, `/home/user/workspace/scratch-research`)
- `crypto-poc/roundtrip.mjs`: Alice + Bob(phone, laptop) → per-device Olm sessions, decrypt on both Bob devices, Bob-laptop reply, Megolm group message to both devices, removal + rotation (removed device fails), pickle restore. `ALL PASS`.
- `crypto-poc/primitives.mjs`: secretstream chunks, Argon2id KEK, `@node-rs/argon2` hash/verify, PGlite via `pg`+Kysely and via Drizzle.
- Run: `cd scratch-research && node roundtrip.mjs && node primitives.mjs` (deps in `crypto-poc/package.json`).

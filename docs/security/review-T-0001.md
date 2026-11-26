# Security review — T-0001 crypto library choice

Reviewer: SECURITY-CRITIC · Date: 2026-11-26 · Subject: `docs/research/crypto-choice.md`, `docs/research/crypto-poc/*` (commit 7357f83)

## Verdict: **APPROVE-WITH-CONDITIONS**

The architecture is sound and stays within the hard rules: vodozemac (Olm + Megolm) for messaging, libsodium for primitives, `@node-rs/argon2` for server password hashing, LiveKit E2EE with keys we distribute over Olm. Rejecting libsignal (AGPL, no browser or RN build) and ts-mls (not audited) is correct. The weak point is the JS/RN binding layer (`@kinsh/*`). It is acceptable for development now, but **not for the P1 gate** until conditions C1–C4 are met.

## What I verified (live, 2026-11-26)

| Claim | Check | Result |
|---|---|---|
| `@kinsh/vodozemac-wasm@0.4.2`, `-rn@0.2.2`, Apache-2.0 | `npm view` | ✅ exist, Apache-2.0 |
| "single maintainer" | npm maintainers + git log | ⚠️ **Inaccurate.** There are two npm maintainers (`meneleus <…@kinshfoundation.org>`, `pomalese <…@azuanagames.com>`). Every post-fork commit (2026-08-04 → 08-12, incl. "add Megolm bindings") is by one author, Elis Pomales. The original commits are by Vadim Filimonov (dTelecom). The repo has 0 stars, 1 fork, 0 issues, and has not been pushed since 2026-08-12. Real risk: a bus factor of one, plus two people who can publish. |
| Provenance | npm attestations | ✅ SLSA v1 provenance via npm Trusted Publishing (OIDC). Built by GitHub-hosted runner from `Meneleus/vodozemac-bindings@refs/tags/v0.4.2`, commit `42e4e0c`, workflow `.github/workflows/build.yml`. This is good: the tarball is traceable to a commit. |
| Reproducible builds | read `build.yml`, `Cargo.toml` | ❌ **Not reproducible.** `dtolnay/rust-toolchain@stable` (floating toolchain), `npm install -g wasm-pack` (unpinned), actions pinned by tag not SHA, `Swatinem/rust-cache` (cache-poisoning surface). No `rust-toolchain.toml`. RN tarball is 23 MB of prebuilt `.so` + xcframework, which we cannot rebuild bit-for-bit. |
| Install scripts | `npm view … scripts` | ✅ `@kinsh/*`: no install/postinstall. ⚠️ `react-native-libsodium@1.7.0` has `postinstall: tar -xzf libsodium/build.tgz` (it unpacks a **prebuilt** native libsodium, with no npm provenance). `libsodium-wrappers-sumo`: no scripts, no provenance (single maintainer jedisct1, upstream author: acceptable). `@node-rs/argon2`, `livekit-client`, `@livekit/react-native`, `@matrix-org/matrix-sdk-crypto-wasm`: provenance ✅. |
| Pins vodozemac 0.10 | `Cargo.toml` / `Cargo.lock` | ✅ `vodozemac = "0.10"`, lock = **0.10.0**. ❌ **Security-relevant:** 0.11.2 (2026-11-05) fixes [GHSA-pqp6-f7wc-6498](https://github.com/matrix-org/vodozemac/security/advisories/GHSA-pqp6-f7wc-6498) (**Medium**, panic on malformed Ed25519 base64, so anyone who can send keys or messages can crash a peer's crypto module), [GHSA-mxcm-mrw6-c446](https://github.com/matrix-org/vodozemac/security/advisories/GHSA-mxcm-mrw6-c446) and [GHSA-v27v-f96q-qhjq](https://github.com/matrix-org/vodozemac/security/advisories/GHSA-v27v-f96q-qhjq) (Low, zeroization). The only patched version is 0.11.2. The research doc lists "pins 0.10" as a maintenance note. It is a **known-vulnerable dependency**. |
| Binding is "thin glue" | read `src/lib.rs` (471 LoC), `crates/vodozemac-ffi/src/lib.rs` (730 LoC) | ✅ Glue only: no primitives, Megolm pinned to `version_1()` (the production Matrix format) on both targets. Delegated to the app: **replay protection** (`(sessionId, messageIndex)`), sender-key binding, and pickle encryption. `pickle()` returns **plaintext JSON** (confirmed). `socket.yml` disables Socket.dev's `obfuscatedFile` alerts (justified in comments, but noted). |
| vodozemac audit | Least Authority PDF + Matrix blog | ✅ Links resolve. The report found 10 valid concerns, 8 fixed during the audit, 2 deferred. ⚠️ The phrase **"no significant findings" is not in the report or the blog**. Remove it. The audit covers early-2022 revisions. Code added later (HPKE in 0.11, the 0.10 refactors) is unaudited. Production use in Element X is real mitigation. |
| libsodium audit | PIA blog + PDF | ✅ Links resolve. The audit is from 2017 (v1.0.12/13). Accept it as a residual risk. |
| OpenMLS audit | blog | ✅ SRLabs, 8 issues, 1 High (MAC authentication), fixed in 8.1 / 7.3, one Low still open. Phase 2 only. Fine. |
| libsignal license | `npm view` | ✅ AGPL-3.0-only. Rejection is correct. |
| LiveKit E2EE | docs link | ✅ Resolves. Agree with "keys ours, no egress/agents on E2EE rooms". |

## Conditions

**Blocking before the P1 gate** (and before any build is given to real users):

- **C1. Fork and upgrade.** Fork `Meneleus/vodozemac-bindings` into `titan717/vodozemac-bindings` and bump to **vodozemac ≥ 0.11.2**. Re-run test vectors (Megolm v1 vectors plus Olm wasm↔RN cross-target interop). Until then, the crypto package must check every remote base64 key for decoded length 32 before passing it to the binding, to avoid crashes from GHSA-pqp6.
- **C2. Hermetic CI build in our org.**
  - Use `rust-toolchain.toml` with an exact version.
  - Pin `wasm-pack`, `cargo-ndk` and `uniffi-bindgen` exactly.
  - Pin all actions by commit SHA. No `rust-cache` on release jobs.
  - Commit `Cargo.lock` and build with `--locked`.
  - Publish under our scope with npm provenance, or consume it as a workspace package built in CI.
  - Build twice and compare wasm hashes (a reproducibility check for wasm at minimum). Native artifacts must come from our CI, not from the upstream tarball.
- **C3. Security review of the forked glue.** I read ~1.2 kLoC of Rust glue plus the RN TS shim before adoption. After that, any diff to the fork is reviewed under `review-checklist.md`. The wasm and RN targets must expose identical JSON shapes (covered by a cross-target test).
- **C4. Dependency hygiene for all crypto packages.**
  - Exact versions with no `^` (the PoC `package.json` uses carets).
  - Lockfile integrity, and `pnpm install --frozen-lockfile`.
  - Install scripts disabled by default, with an explicit allowlist (`react-native-libsodium` postinstall: pin its tarball hash, or build libsodium ourselves).
  - CI runs `npm audit signatures` / a provenance check.
  - Renovate PRs for crypto deps need SECURITY-CRITIC review.
  - Drop `kysely-pglite` and `@matrix-org/matrix-sdk-crypto-wasm` from any non-research package.

**Blocking for the feature that introduces them** (enforced in the T-0005 crypto package review):

- **C5. App-layer protocol obligations.** These are orchestration only. Each needs a test.
  - (a) Each device publishes a **self-signed device-key object** (Ed25519 over a canonical encoding). Clients verify it and verify signed OTKs/fallback keys.
  - (b) On Olm decrypt, the client checks that `senderIdentityKey` equals the pinned Curve25519 of the claimed sender device.
  - (c) A Megolm room key is accepted only if it arrived over Olm from the device that owns the session. Store the binding `(sessionId → sender curve25519/ed25519, conversationId)` and reject Megolm messages whose session belongs to a different sender or conversation.
  - (d) Replay table for `(sessionId, messageIndex)`.
  - (e) Rotate on every membership/device change, plus every 100 msgs / 7 days. No `exportAt` history sharing in P1.
  - (f) Pickles and the local DB are encrypted with a device storage key held in OS keystore or non-extractable WebCrypto (libsodium/WebCrypto only).
  - (g) Safety numbers, key-change warnings and cross-signing per `threat-model.md` §4.2.
- **C6. Password and recovery separation.** The account password never feeds a client KEK. The default is a **random recovery key** (≥128 bit). A passphrase option uses `crypto_pwhash` Argon2id ≥ MODERATE with a strength gate. Note: MODERATE needs 256 MiB, which may fail in mobile-browser wasm. In that case, refuse the passphrase option rather than silently lowering the cost to INTERACTIVE.
- **C7. LiveKit.**
  - Per-participant keys (`sharedKey:false`), sent over Olm only to verified/pinned devices.
  - The client refuses to join or publish without E2EE.
  - No egress, recording, agents or transcription on E2EE rooms.
  - No key material in JWT or room/participant metadata.
- **C8. Doc corrections in `crypto-choice.md`:**
  - Fix the maintainer statement.
  - Remove "no significant findings".
  - Mark vodozemac 0.10.0 as affected by GHSA-pqp6-f7wc-6498.
  - State that npm provenance exists but builds are not reproducible.

## Non-blocking notes
- Fallback path: `@matrix-org/matrix-sdk-crypto-wasm` cannot serve RN. If the fork fails, the realistic RN fallback is our own UniFFI build of vodozemac, which C2 already gives us.
- Argon2id server params `m=19456,t=2,p=1` are the OWASP floor. Prefer `m=65536,t=3` if p95 login latency allows. Rate-limit before hashing (see threat model §4.1).
- OpenMLS as the Phase 2 path for large groups/Docks: agreed. Re-review when a maintained JS/RN build exists or we own one.
- PoC is fine as research. It must not be copied into `packages/` verbatim (it uses the first OTK without signature verification, plaintext pickles, and caret deps).

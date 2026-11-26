# Upstream provenance

| | |
|---|---|
| Upstream repo | https://github.com/Meneleus/vodozemac-bindings |
| Upstream commit | `42e4e0c0962adb2c0ff68ff1c9b11ea1601ad531` (tag `v0.4.2`, npm `@kinsh/vodozemac-wasm@0.4.2`) |
| Vendored on | 2026-11-26 |
| Scope | wasm target only (root crate). The UniFFI/React Native crate (`crates/vodozemac-ffi`, `rn/`, prebuilt `.so`/xcframework) is **not** vendored yet — see "Not yet covered". |

## Files

| File | Status vs upstream |
|---|---|
| `src/lib.rs` | **byte-identical** (`git show 42e4e0c0962adb2c0ff68ff1c9b11ea1601ad531:src/lib.rs`) — compiles unchanged against vodozemac 0.11.2 |
| `LICENSE` | identical |
| `scripts/smoke.mjs`, `scripts/verify-test-vectors.mjs`, `scripts/generate-test-vectors.mjs` | module name `kinsh_vodozemac_wasm` → `secrets_vodozemac_wasm` only |
| `test-vectors/megolm-v1.json` | identical (vectors still verify on 0.11.2) |
| `README.upstream.md` | upstream README, renamed |
| `Cargo.toml` | rewritten: crate renamed `secrets-vodozemac-wasm`; `vodozemac = "=0.11.2"` (was `"0.10"`, lock 0.10.0 — affected by GHSA-pqp6-f7wc-6498); `getrandom 0.2 + js` → `getrandom =0.4.3 + wasm_js` (what vodozemac 0.11 uses); `wasm-bindgen = "=0.2.130"`; unused `js-sys`, `serde-wasm-bindgen` dropped; UniFFI workspace member dropped; release profile adds `codegen-units=1`, `panic="abort"` |
| `Cargo.lock` | regenerated for the above; build uses `--locked` |
| `scripts/strip-pkg-gitignore.mjs` | removed (only needed for wasm-pack) |
| `rust-toolchain.toml`, `tools/*`, `package.json`, `NOTICE`, `pkg.sha256` | ours |

## Build (hermetic inputs)
- rustc **1.100.0** via `rust-toolchain.toml` (rustup on the runner reads it; no third-party toolchain action).
- crates via `Cargo.lock` + `cargo build --locked`.
- **wasm-bindgen CLI 0.2.130** prebuilt release, SHA-256-verified in `tools/install-wasm-bindgen.sh`. We call wasm-bindgen directly instead of wasm-pack: wasm-pack is only a wrapper that downloads wasm-bindgen and an unpinned binaryen `wasm-opt`; removing it removes two unpinned inputs. No `wasm-opt` pass.
- `--remap-path-prefix` strips checkout/registry paths, so output does not depend on the build directory (verified locally: two different directories → identical hashes).
- `pkg.sha256` = SHA-256 of every file in `pkg-web/` + `pkg-node/` and a TOTAL line. CI builds twice in different directories, and both must equal the committed file.

## Updating
1. Bump the version in `Cargo.toml` and run `cargo update -p vodozemac`.
2. Run `pnpm --filter @secrets/vodozemac-wasm build:wasm && … test:wasm`.
3. Copy `pkg.sha256.actual` → `pkg.sha256`.
4. Get a SECURITY-CRITIC review (C3) of any `src/lib.rs` / `Cargo.lock` diff.

## Not yet covered (follow-ups)
- React Native: vendor `crates/vodozemac-ffi` and `rn/`, then build the Android `.so` (cargo-ndk pinned) and the iOS xcframework (uniffi-bindgen pinned) in our CI. Until then, RN must not ship `@kinsh/vodozemac-rn`'s prebuilt 0.10 binaries (C1/C2).
- Publishing with npm provenance (optional). Today consumers use the workspace package and the CI artifact.

# @secrets/vodozemac-wasm

Olm + Megolm via [vodozemac](https://github.com/matrix-org/vodozemac) 0.11.2, compiled to wasm for web, Node and Tauri.
Same JS API as `@kinsh/vodozemac-wasm@0.4.2` (see `README.upstream.md`). Provenance, local changes and the build recipe are in `UPSTREAM.md`.

Build locally (needs rustup + Node 20):
```sh
packages/vodozemac-wasm/tools/install-wasm-bindgen.sh   # pinned + hash-checked
pnpm --filter @secrets/vodozemac-wasm build:wasm
pnpm --filter @secrets/vodozemac-wasm test:wasm
```
The build is deliberately not called `build`, so the root `pnpm build` does not require Rust. CI builds it in `.github/workflows/wasm.yml`.

App-layer obligations still apply (security review C5): `pickle()` is plaintext JSON, and replay protection plus sender binding are the caller's job.

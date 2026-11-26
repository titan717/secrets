#!/usr/bin/env bash
# Hermetic-ish wasm build. Inputs pinned: rustc (rust-toolchain.toml), crates (Cargo.lock, --locked),
# wasm-bindgen CLI (WASM_BINDGEN_VERSION below == wasm-bindgen crate in Cargo.lock). No wasm-opt.
set -euo pipefail
cd "$(dirname "$0")/.."
WASM_BINDGEN_VERSION=0.2.130
have="$(wasm-bindgen --version 2>/dev/null | awk '{print $2}' || true)"
if [ "$have" != "$WASM_BINDGEN_VERSION" ]; then
  echo "need wasm-bindgen-cli $WASM_BINDGEN_VERSION on PATH (have: ${have:-none}); run tools/install-wasm-bindgen.sh" >&2; exit 1
fi
CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
# Strip machine-specific absolute paths from panic/location strings so output is path-independent.
export RUSTFLAGS="--remap-path-prefix=$PWD=/build --remap-path-prefix=$CARGO_HOME/registry/src=/cargo/registry/src --remap-path-prefix=$CARGO_HOME/git/checkouts=/cargo/git"
export SOURCE_DATE_EPOCH=0 CARGO_INCREMENTAL=0
cargo build --locked --release --target wasm32-unknown-unknown
WASM=target/wasm32-unknown-unknown/release/secrets_vodozemac_wasm.wasm
rm -rf pkg-web pkg-node
wasm-bindgen --target web    --out-dir pkg-web  "$WASM"
wasm-bindgen --target nodejs --out-dir pkg-node "$WASM"
# The root package.json is "type": "module"; mark the CommonJS node build explicitly
# (wasm-pack used to do this). Static content, so it stays reproducible.
printf '{ "type": "commonjs" }\n' > pkg-node/package.json
printf '{ "type": "module" }\n' > pkg-web/package.json
node tools/hash-pkg.mjs > pkg.sha256.actual
cat pkg.sha256.actual

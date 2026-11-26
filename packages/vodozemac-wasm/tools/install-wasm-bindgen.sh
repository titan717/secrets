#!/usr/bin/env bash
# Installs the prebuilt wasm-bindgen CLI release, verified against a pinned SHA-256.
set -euo pipefail
V=0.2.130
T=x86_64-unknown-linux-musl
SHA256=9687f3bb551b9f66f37ed32a40d7913a00f7962db653054e56857bc306c3227f
DEST="${1:-$HOME/.local/bin}"
tmp="$(mktemp -d)"
curl -fsSL -o "$tmp/wb.tgz" "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/$V/wasm-bindgen-$V-$T.tar.gz"
echo "$SHA256  $tmp/wb.tgz" | sha256sum -c -
tar -xzf "$tmp/wb.tgz" -C "$tmp"
mkdir -p "$DEST" && install -m 0755 "$tmp/wasm-bindgen-$V-$T/wasm-bindgen" "$DEST/wasm-bindgen"
"$DEST/wasm-bindgen" --version

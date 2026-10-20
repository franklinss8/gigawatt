#!/usr/bin/env bash
# Equivalent of `anchor test --skip-build` that does not depend on IPv6 (portpicker quirk in some sandboxes).
# Usage: scripts/test-local.sh      (expects target/deploy/gigawatt.so to exist: run `anchor build` first)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID=$(solana-keygen pubkey "$ROOT/target/deploy/gigawatt-keypair.json")
LEDGER="${TMPDIR:-/tmp}/gigawatt-test-ledger"
rm -rf "$LEDGER"
solana-test-validator -r --quiet -l "$LEDGER" --bpf-program "$PID" "$ROOT/target/deploy/gigawatt.so" &
VPID=$!
trap 'kill $VPID 2>/dev/null || true' EXIT
for i in $(seq 1 60); do
  if curl -s -m 2 http://127.0.0.1:8899 -X POST -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q ok; then break; fi
  sleep 1
done
WALLET="${ANCHOR_WALLET:-$ROOT/scripts/.keys/deployer.json}"
[ -f "$WALLET" ] || solana-keygen new --no-bip39-passphrase -s -o "$WALLET"
solana airdrop 100 "$(solana-keygen pubkey "$WALLET")" -u localhost >/dev/null
cd "$ROOT"
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET="$WALLET" pnpm exec mocha 'tests/**/*.ts'

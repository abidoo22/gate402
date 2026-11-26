#!/usr/bin/env bash
set -euo pipefail

# Seeds the 3 flagship Gate402 live services via a wallet holding an active .ai Agent ID.
# Note: You can also register them directly through the Gate402 /developers web UI with your
# Binance Agentic Wallet (zero private keys in terminal!).
export PATH="$HOME/.foundry/bin:$PATH"
ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

: "${GATE402_CONTRACT_ADDRESS:?Set GATE402_CONTRACT_ADDRESS in .env}"
: "${NEXT_PUBLIC_APP_URL:?Set NEXT_PUBLIC_APP_URL in .env}"
: "${GATE402_PAY_TO_ADDRESS:?Set GATE402_PAY_TO_ADDRESS in .env}"

echo "Use the Gate402 /developers portal (or baw contract-call) from your .ai Agentic Wallet to call:"
echo "  1) activatePass()"
echo "  2) registerService(keccak256('bsc-safety-audit'), 'BSC Contract Safety Audit', '${NEXT_PUBLIC_APP_URL}/api/v1/bsc/safety-audit', 25, 10000000000000000, ${GATE402_PAY_TO_ADDRESS})"
echo "  3) registerService(keccak256('bsc-dex-intel'), 'BSC DEX Liquidity Intel', '${NEXT_PUBLIC_APP_URL}/api/v1/bsc/dex-intel', 25, 10000000000000000, ${GATE402_PAY_TO_ADDRESS})"
echo "  4) registerService(keccak256('bsc-tx-preflight'), 'BSC Tx Calldata Preflight', '${NEXT_PUBLIC_APP_URL}/api/v1/bsc/tx-preflight', 25, 10000000000000000, ${GATE402_PAY_TO_ADDRESS})"

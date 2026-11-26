#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

: "${DEPLOYER_PRIVATE_KEY:?Set DEPLOYER_PRIVATE_KEY in .env (use a fresh deployer wallet funded with ~$3 BNB)}"
BSC_RPC_URL="${BSC_RPC_URL:-https://bsc-dataseed.binance.org/}"

VERIFY_ARGS=()
if [[ -n "${BSCSCAN_API_KEY:-}" ]]; then
  VERIFY_ARGS+=(--verify --etherscan-api-key "$BSCSCAN_API_KEY")
fi

echo "Deploying Gate402Registry to BNB Smart Chain Mainnet (chain 56)..."
cd "$ROOT_DIR/packages/contracts"
forge script script/DeployGate402.s.sol:DeployGate402 \
  --rpc-url "$BSC_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast \
  "${VERIFY_ARGS[@]}"

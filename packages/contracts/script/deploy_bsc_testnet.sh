#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

: "${DEPLOYER_PRIVATE_KEY:?Set DEPLOYER_PRIVATE_KEY in .env}"
echo "Deploying MockHandleRegistry + Gate402Registry to BSC Testnet (chain 97)..."
cd "$ROOT_DIR/packages/contracts"
MOCK_OUT=$(forge create test/mocks/MockHandleRegistry.sol:MockHandleRegistry \
  --rpc-url "https://data-seed-prebsc-1-s1.binance.org:8545/" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast)
echo "$MOCK_OUT"
MOCK_ADDR=$(echo "$MOCK_OUT" | awk '/Deployed to:/ {print $3}')
echo "MockHandleRegistry at $MOCK_ADDR"

AGENT_ID_REGISTRY_ADDRESS="$MOCK_ADDR" forge script script/DeployGate402.s.sol:DeployGate402 \
  --rpc-url "https://data-seed-prebsc-1-s1.binance.org:8545/" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast

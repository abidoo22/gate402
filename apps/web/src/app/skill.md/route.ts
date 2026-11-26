import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";

export async function GET() {
  const cfg = getServerConfig();
  const contract = cfg.gate402ContractAddress ?? "0x08441938440B097ABd849FDB0F6CFe700AB6e994";
  const baseUrl = cfg.appUrl.replace(/\/$/, "");

  const markdown = `---
name: gate402
description: Sybil-proof Binance Agent ID (.ai) free-tier & x402 v2 BSC intelligence gateway. Activate a free 0-BNB .ai Guard Pass on BSC Mainnet, run BSC contract safety & DEX scans, and handle HTTP 402 USDT overflow via baw.
---

# Gate402 Agent Skill (Binance Agentic Wallet \`baw\`)

- **Live Gateway:** ${baseUrl}
- **MCP Endpoint (Streamable HTTP):** ${baseUrl}/api/mcp
- **Gate402Registry (BSC Mainnet, Chain 56, Ownerless):** \`${contract}\`
- **SPACE ID Agent ID HandleRegistry:** \`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F\`

## Hard Safety Rules (Never Override)
1. Run \`baw wallet agent-id --json\` and \`baw wallet settings --json\` before any contract call or signature.
2. ALWAYS run \`preview\` first, show exact calldata/value/recipient to the user, and wait for explicit user confirmation before running \`execute\` or \`sign\`.
3. Never scan personal EOA wallets — Gate402 strictly audits deployed smart contracts only.

## 1. Check Agent ID & Developer Mode
\`\`\`bash
baw wallet agent-id --json
baw wallet address --json
baw wallet settings --json
\`\`\`

## 2. Activate Lifetime Free .ai Guard Pass (0 BNB, Gas Only)
Function: \`activatePass()\` — selector \`0x01144d47\` (daily 2x quota refresh \`refreshDailyPass()\` = \`0xfaa0cd7d\`).

\`\`\`bash
# Step A: Preview (NEVER skip)
baw contract-call preview \\
  --binanceChainId 56 \\
  --from <USER_BSC_AGENTIC_WALLET> \\
  --to ${contract} \\
  --value 0 \\
  --inputData 0x01144d47 \\
  --json

# Step B: Only after explicit user confirmation
baw contract-call execute --requestId <REQUEST_ID> --json
\`\`\`

## 3. Free Daily BSC Contract Safety & DEX Scans (25-50 Free/Day per .ai)
Sign this exact EIP-191 auth payload with \`baw sign-message\` (0 gas, stateless, 5 min window):
\`\`\`text
Gate402 Agent ID Access
Service: bsc-safety-audit
Wallet: <lowercase_wallet_address>
DateUTC: <YYYY-MM-DD>
Timestamp: <unix_seconds>
\`\`\`

Then request:
\`\`\`bash
curl -i "${baseUrl}/api/v1/bsc/safety-audit?address=<TARGET_BSC_CONTRACT>" \\
  -H "X-Agent-Address: <wallet>" \\
  -H "X-Agent-Timestamp: <unix_seconds>" \\
  -H "X-Agent-Signature: <signature>"
\`\`\`

## 4. Seamless Binance x402 v2 Paid Overflow (0.01 USDT on BSC)
If the API returns \`HTTP 402\` with a \`PAYMENT-REQUIRED\` header:
\`\`\`bash
# Preview options and ask user confirmation
baw x402-payment preview --paymentRequirements "<PAYMENT-REQUIRED-HEADER>" --json

# Sign only after user confirms
baw x402-payment sign --paymentId <PAYMENT_ID> --selectedIndex 1 --json
\`\`\`
Replay the HTTP request with \`PAYMENT-SIGNATURE: <paymentHeaderValue>\`.
`;

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

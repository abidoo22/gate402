---
name: gate402
description: Interact with Gate402 on BNB Smart Chain using your Binance Agentic Wallet (.ai Agent ID) to claim a free 0-BNB Guard Pass, run Sybil-proof BSC contract safety audits, anchor audit digests on-chain, and pay x402 v2 USDT overflow automatically with explicit user confirmation.
---

# Gate402 Agent Skill (Binance Agentic Wallet `baw`)

Use this skill when the user asks to:
- Activate or refresh their **Gate402 `.ai` Guard Pass** on BNB Smart Chain (chain `56`, 0 BNB value, gas only).
- Audit a **BSC smart contract** for honeypots, hidden owners, taxes, or PancakeSwap liquidity depth.
- Run a **BSC transaction preflight** check before signing calldata.
- Handle an **HTTP `402 Payment Required`** response from Gate402 using Binance Agentic Wallet's native `x402-payment` flow.

## Hard Safety Invariants (Never Override)

1. **Always check Agent ID & Developer Mode first.** Before calling any contract function or message signature, run `baw wallet agent-id --json` and `baw wallet settings --json`.
2. **Never bypass user confirmation.** For every `contract-call`, `sign-message`, or `x402-payment` action, run the `preview` step first, show the parsed call/value/risks to the user, and **wait for the user's explicit confirmation** in a subsequent turn before calling `execute` or `sign`.
3. **Never scan personal wallets.** Gate402 only audits deployed smart contracts (`code.length > 0`). Never use this skill to inspect or look up personal EOA wallets by name.
4. **Never collect private keys, seed phrases, or pairing codes.** All signing stays inside the user's local `baw` CLI session.

---

## Step 1 — Pre-Checks

```bash
baw wallet agent-id --json
baw wallet address --json
baw wallet settings --json
```

- If `claimed` is `false`, instruct the user to claim their permanent `.ai` Agent ID inside the Binance App (`Web3 Wallet → Agent ID banner`).
- If `devMode.enabled` is `false`, ask the user to enable **Developer Mode** in the Binance App (`Agentic Wallet → Settings → Developer Mode`) before calling `contract-call` or `sign-message`.

---

## Step 2 — Activate Free `.ai` Guard Pass (0 BNB, Gas Only)

Call `activatePass()` (exact verified 4-byte selector `0x01144d47`; daily 2x quota refresh `refreshDailyPass()` is `0xfaa0cd7d`) on the verified BSC Mainnet `Gate402Registry` (`0x08441938440B097ABd849FDB0F6CFe700AB6e994`, `--binanceChainId 56`, `--value 0`):

```bash
# 1. Preview first (NEVER skip)
baw contract-call preview \
  --binanceChainId 56 \
  --from <USER_BSC_AGENTIC_WALLET> \
  --to 0x08441938440B097ABd849FDB0F6CFe700AB6e994 \
  --value 0 \
  --inputData 0x01144d47 \
  --json
```

Show the simulation result, gas estimate, and zero BNB transfer value to the user. Only after explicit confirmation:

```bash
# 2. Execute with returned requestId
baw contract-call execute --requestId <REQUEST_ID> --json
```

---

## Step 3 — Call Free-Tier BSC Safety Audit (25–50 Free Calls/Day per `.ai`)

Build the exact deterministic EIP-191 auth message:

```text
Gate402 Agent ID Access
Service: bsc-safety-audit
Wallet: <lowercase_wallet_address>
DateUTC: <YYYY-MM-DD>
Timestamp: <unix_seconds>
```

1. Preview & confirm `baw sign-message` (off-chain signature, 0 gas, zero custody).
2. Send the request with headers:
   - `X-Agent-Address: <wallet>`
   - `X-Agent-Timestamp: <unix_seconds>`
   - `X-Agent-Signature: <signature>`

```bash
curl -i "https://web-nu-nine-yyzt7gth6g.vercel.app/api/v1/bsc/safety-audit?address=<TARGET_CONTRACT>" \
  -H "X-Agent-Address: <wallet>" \
  -H "X-Agent-Timestamp: <unix_seconds>" \
  -H "X-Agent-Signature: <signature>"
```

---

## Step 4 — Seamless Binance `x402` v2 Paid Overflow (BSC USDT / USDC)

If the API responds with `HTTP 402 Payment Required` and a `PAYMENT-REQUIRED` header (when daily free quota is reached or when calling without a Pass):

```bash
# 1. Preview x402 payment options (shows BSC USDT / USDC amount & recipient)
baw x402-payment preview --paymentRequirements "<PAYMENT_REQUIRED_HEADER_VALUE>" --json
```

Present the exact token, amount (e.g. `0.01 USDT`), chain (`BSC / eip155:56`), and `payTo` address to the user and **wait for explicit confirmation**.

```bash
# 2. Sign selected option only after user confirms
baw x402-payment sign --paymentId <PAYMENT_ID> --selectedIndex 1 --json
```

3. Replay the original HTTP request attaching the returned `PAYMENT-SIGNATURE: <paymentHeaderValue>` header. Read settlement metadata from the `PAYMENT-RESPONSE` response header.

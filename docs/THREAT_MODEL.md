# Gate402 Threat Model & Security Compliance Disclosure

## 1. Explicit Owner & Admin Permission Disclosure

Per the Binance Wallet × BNB Chain Agent ID Hackathon rules requiring full open-source disclosure of contract owner permissions:

- **`Gate402Registry.sol` has NO owner and NO admin role.**
- **Minting:** None (Gate402 has no token).
- **Tax / Fee Changes:** None (the contract charges zero protocol fees).
- **Pausing / Freezing:** None (functions cannot be paused or censored by anyone).
- **Withdrawing User Funds:** Impossible — the contract contains no `payable` functions, no `receive()`, no `fallback()`, and never holds BNB or ERC-20 tokens.
- **Upgradeability:** None — immutable bytecode bound permanently to SPACE ID's `HandleRegistry` (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`).
- **Service Updates:** Only the original `.ai` provider wallet that registered a `slug` can call `updateService()` on that specific `slug`.

---

## 2. Compliance With All 10 Hackathon Safety Red Lines

| # | Red Line | Gate402 Design Control |
| :-: | :--- | :--- |
| 1 | No web QR login / server session storage for Agentic Wallet | Web UI uses standard EIP-1193 browser wallet signing; API auth is stateless per-request EIP-191 (`5 min` expiry). Zero server-stored sessions. |
| 2 | No bypassing user tx confirmation in agent skills | `skill/gate402/SKILL.md` strictly mandates `preview` → explicit user confirmation → `execute` / `sign` on separate turns. |
| 3 | No unauthorized transfers or hidden unlimited approvals | Zero fund custody; `/api/v1/bsc/tx-preflight` actively detects and warns users against unlimited `approve(MAX_UINT256)` calldata. |
| 4 | Open-source verified contracts with disclosed owner permissions | Verified on BscScan + Sourcify under MIT license; ownerless/immutable design documented in NatSpec and Section 1 above. |
| 5 | No Binance / BNB brand impersonation | Named `Gate402` (independent MIT project with explicit non-affiliation footer). |
| 6 | No collection of sensitive credentials | Never asks for seed phrases, private keys, API secrets, or pairing codes. |
| 7 | No promises of passive income / guaranteed returns | Utility infrastructure only; zero investment or yield claims. |
| 8 | Risk warnings on trading/analytics pages | Clear non-financial-advice heuristic disclaimer on every scanner & API output. |
| 9 | Never package Agent ID as a "wallet lookup by name" tool | **Enforced at BOTH layers:** `Gate402Registry.recordAuditDigest()` reverts with `TargetNotAContract()` if `targetContract.code.length == 0`, and `/api/v1/bsc/safety-audit` returns HTTP `400 EOA_NOT_ALLOWED` for any non-contract address. |
| 10 | No fake volume / Sybil manipulation | Quota keys bind to immutable `.ai` handles (`handleHashToWallet` prevents double-claiming); organic user flow only. |

---

## 3. Known Trust Assumptions & Boundaries

1. **Upstream `HandleRegistry` (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`):** Gate402 performs atomic 3-read verification (`balanceOf`, `handleOf`, `ownerOfHandle`) and wraps read views in `try/catch` so upstream RPC/registry anomalies fail closed (`eligible = false`) rather than granting unauthorized free access.
2. **Off-Chain Quota Metering:** Without Upstash Redis configured, Vercel serverless instances keep an in-memory per-instance counter (still bounded per UTC day). Setting free Upstash Redis env vars enables globally atomic cross-region counting at \$0/month.
3. **Security Heuristics:** GoPlus, DexScreener, and bytecode selector checks are automated heuristics — never a substitute for a formal smart contract audit.

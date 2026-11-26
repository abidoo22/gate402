# Gate402 Deployment, Demo & Organic Growth Playbook

Target deadline: **December 9, 2026 at 08:00 UTC** · Budget: **~\$1.50 – \$2.50 total (well under \$10)**

---

## Phase A — Deploy to BSC Mainnet & Vercel (~10 Minutes)

### 1. Prepare a Fresh Deployer Wallet (~\$2–\$3 BNB)
1. Create a fresh wallet in MetaMask/Rabby (separate from your main holdings and separate from your keyless Agentic Wallet).
2. Send ~0.005 BNB (~\$2.50–\$3.00) on **BNB Smart Chain (BEP-20)** to it.
3. Copy `.env.example` → `.env` at the repo root and fill in:
   ```bash
   DEPLOYER_PRIVATE_KEY=0x<fresh_deployer_private_key>
   BSCSCAN_API_KEY=<free key from bscscan.com/myapikey>
   BSC_RPC_URL=https://bsc-dataseed.binance.org/
   ```
   *(Never commit `.env` — it is already in `.gitignore`.)*

### 2. Deploy & Auto-Verify `Gate402Registry.sol` on BSC Mainnet
```bash
pnpm deploy:bsc
```
Copy the printed `Gate402Registry deployed at: 0x...` address! Confirm the green checkmark on `https://bscscan.com/address/<YOUR_CONTRACT>#code`.

*(Note: Since `Gate402Registry` is 100% ownerless and immutable, that deployer wallet holds zero admin power after deployment.)*

### 3. Push to GitHub & Deploy on Vercel (\$0.00)
1. Create a **public** GitHub repo named `gate402` (add GitHub topics: `binance-agent-id`, `agent-id-hackathon`, `bnb-chain`, `x402`, `bsc`, `mcp`).
2. Push your code:
   ```bash
   git add .
   git commit -m "feat: Gate402 Agent ID free-tier & x402 v2 API gateway"
   git remote add origin https://github.com/<YOUR_GITHUB>/gate402.git
   git push -u origin main
   ```
3. In **Vercel Dashboard → Add New Project → Import `gate402`**:
   - Set **Root Directory** to `apps/web`
   - Add Environment Variables:
     - `NEXT_PUBLIC_GATE402_CONTRACT_ADDRESS` = `<your deployed BSC contract>`
     - `GATE402_CONTRACT_ADDRESS` = `<your deployed BSC contract>`
     - `GATE402_PAY_TO_ADDRESS` = `<your BSC wallet address>`
     - `NEXT_PUBLIC_APP_URL` = `https://<your-project>.vercel.app`
     - `BSC_RPC_URL` = `https://bsc-dataseed.binance.org/`
   - Click **Deploy**.

### 4. Activate Your First Pass & Register the 3 Flagship Services (`abido.ai`)
1. Open your live Vercel URL using your **`abido.ai` Agentic Wallet** (or MetaMask connected to BSC).
2. Click **"Claim Free `.ai` Guard Pass (0 BNB)"** → confirms Pass #1 for `abido.ai`!
3. Run a live scan on WBNB (`0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`) and click **"Anchor Audit Digest On-Chain"**.
4. Visit `/developers` and register our 3 flagship services on-chain:
   - `bsc-safety-audit` → `https://<your-app>.vercel.app/api/v1/bsc/safety-audit` (25 free/day, 0.01 USDT)
   - `bsc-dex-intel` → `https://<your-app>.vercel.app/api/v1/bsc/dex-intel` (25 free/day, 0.01 USDT)
   - `bsc-tx-preflight` → `https://<your-app>.vercel.app/api/v1/bsc/tx-preflight` (25 free/day, 0.01 USDT)

---

## Phase B — 90-Second Demo Video Script

Record your screen at 1080p (OBS / Loom / browser recorder) and upload to YouTube (Unlisted/Public) or X:
- **0:00–0:15 — The Problem:** Show Gate402 homepage. Explain: *"AI agents don't have credit cards, and free Web3/AI APIs get drained by Sybil bot farms. Gate402 uses Binance's soulbound `.ai` Agent ID to fix both."*
- **0:15–0:35 — 1-Click Free `.ai` Guard Pass:** Connect `abido.ai`, show live verification against SPACE ID `HandleRegistry` (`0x60B9...022F`), show Pass #1 active with 0 BNB cost & ownerless BscScan contract.
- **0:35–0:55 — Real Live Utility (Not a Mock):** Paste a real BSC token contract → show real-time Safety Score, Buy/Sell tax, DEX liquidity depth, and anchor the audit digest on-chain (show BscScan tx). Also show an EOA address being rejected (Red Line #9 safety).
- **0:55–1:15 — Native Binance `x402` v2 Overflow & Developer SDK:** Switch to `/developers`, click **"Trigger Live HTTP 402"**, show the real `PAYMENT-REQUIRED` header (`x402Version: 2`, `eip155:56` BSC USDT), the 5-line `@gate402/middleware` snippet, and `/api/mcp`.
- **1:15–1:30 — Closing:** Highlight open-source MIT repo, Foundry BSC Mainnet fork tests, and `SKILL.md` for `baw` CLI.

---

## Phase C — 5-Channel Organic Growth Kit (Hitting 30–150+ Real `.ai` IDs at \$0)

### 1. X / Twitter Launch Thread (`#BinanceWalletHackathon` `#AgenticWallet`)
> **Tweet 1:**
> AI agents don't have credit cards — and free APIs get destroyed by bot farms.
>
> Meet **Gate402**: 1 verified Binance `.ai` Agent ID = **25–50 free daily BSC Contract Safety & DEX Scans**, with seamless overflow into **Binance `x402` v2 (BSC USDT)**.
>
> 0 BNB cost · Ownerless & BscScan verified · Live on BSC:
> <YOUR_VERCEL_URL>
>
> #BinanceWalletHackathon #AgenticWallet
>
> **Tweet 2 (Consumer Hook):**
> Checking new BSC free-mints or hackathon dApps?
> Claim your free `.ai` Guard Pass (gas only, ~\$0.03) and scan any BSC contract for honeypots, hidden owners, taxes, and PancakeSwap liquidity before you sign.
>
> (Strictly smart contracts only — personal wallet lookups are blocked on-chain!)
>
> **Tweet 3 (Builder Hook + Bilingual CN TL;DR):**
> Devs: add Sybil-proof `.ai` free tiers + `x402` USDT billing to your own API/MCP in 5 lines of TypeScript (`@gate402/middleware`).
>
> 中文简介：持有 `.ai` Agent ID 即可 0 BNB 免费激活 Guard Pass，每天免费扫描 25–50 次 BSC 合约安全/貔貅检测与流动性，超额无缝衔接 `x402` USDT 支付！合约无 owner 已开源验证。

### 2. Your 5K Telegram Channel (Plain-Language Post — Zero Tech Jargon!)
> **Free Anti-Scam Pass for Binance Web3 Wallet `.ai` Holders!**
>
> If you have a Binance account, Binance Wallet lets you claim a free `.ai` name (like `yourname.ai`).
>
> I just launched **Gate402** for the BNB Chain Hackathon — connect your `.ai` wallet and click **"Claim Free Guard Pass"** (0 BNB cost, just ~\$0.03 BSC gas) to unlock **25–50 free daily BSC Scam & Honeypot Scans** so you can check any BSC token or mint contract before buying.
>
> - 100% open-source, no token, no deposit, zero custody
> - Try it live here: `<YOUR_VERCEL_URL>`
> - Need help claiming your `.ai` name in the Binance App? Reply below and I'll guide you!

### 3. Peer Hackathon Builder Outreach (X / BNB Chain Discord)
Run 20–30 fellow `#BinanceWalletHackathon` projects' BSC contracts through Gate402, anchor clean digests, and reply politely to their X launch threads:
> *"Awesome build! Ran your verified BSC contract through Gate402's `.ai` Safety Scanner — scored 95/100 SAFE. Feel free to claim a free 0-BNB `.ai` Guard Pass or register your API on Gate402 if you want Sybil-proof free tiers + x402 billing: `<YOUR_VERCEL_URL>`"*

### 4. Auto-Discovery Listing
- Submit your live GitHub repo & URL to **AgentAtlas** (`agentatlas.vip` / `@zsf11221` on X) and Binance Square with `#BinanceWalletHackathon` `#AgenticWallet`.

### 5. Official Hackathon Survey Submission (Before Dec 9, 2026 08:00 UTC)
- **Form:** `https://app.binance.com/uni-qr/user-survey/fb26d2bd25e04329b1ba77c7b3811d23`
- **Project Name:** `Gate402`
- **Website:** `<YOUR_VERCEL_URL>`
- **Contract Address:** `<YOUR_DEPLOYED_BSC_CONTRACT>` (verified on BscScan!)
- **How Agent ID Is Used:**
  > Gate402 uses Binance Agent ID (SPACE ID `HandleRegistry` `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`) as a mathematically load-bearing Sybil-resistance primitive for Web3/AI APIs. Our immutable, ownerless BSC contract (`Gate402Registry`) atomically verifies `balanceOf`, `handleOf`, and `ownerOfHandle` so every KYC-verified human (`.ai`) can activate a free 0-BNB Guard Pass unlocking 25–50 Sybil-proof free daily calls across live BSC safety audit, DEX liquidity, and transaction preflight APIs (plus Streamable HTTP MCP and `baw` `SKILL.md`), seamlessly overflowing to Binance `x402` v2 BSC USDT micropayments when free quotas are exhausted. Third-party developers can also register their own APIs on-chain and adopt `@gate402/middleware` in 5 lines of TypeScript.
- **Bonus:** Also post an analysis thread on X and submit to the 2,000 USDC Community Promotion survey (`https://app.binance.com/uni-qr/user-survey/ff6832f8d2984af289068c9450a3c98c`)!

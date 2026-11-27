"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Layers,
  Play,
  Terminal,
  Wallet,
  Zap,
} from "lucide-react";
import type { Address } from "viem";
import { serviceSlugHash } from "@gate402/middleware";
import { DEFAULT_GATE402_CONTRACT_ADDRESS, SAMPLE_WBNB_ADDRESS } from "@/lib/config";
import { connectBscWallet, sendRegisterServiceTx } from "@/lib/wallet";

interface StatusData {
  gate402ContractAddress: string | null;
  flagshipServices: Array<{
    slug: string;
    name: string;
    endpointUrl: string;
    method: string;
    freeCallsPerDay: number;
    priceUsdtLabel: string;
    description: string;
  }>;
  onChainServices: Array<{
    slug: string;
    name: string;
    providerHandle: string;
    endpointUrl: string;
    freeCallsPerDay: number;
    priceUsdtWei: string;
    payTo: string;
    active: boolean;
  }>;
}

type CodeTab = "middleware" | "standalone" | "mcp" | "skill" | "solidity";

export function DeveloperPortal() {
  const [data, setData] = useState<StatusData | null>(null);
  const [wallet, setWallet] = useState<Address | null>(null);
  const [activeTab, setActiveTab] = useState<CodeTab>("middleware");
  const [x402Response, setX402Response] = useState<{
    status: number;
    headerValue: string;
    decoded: unknown;
    latencyMs: number;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("https://web-nu-nine-yyzt7gth6g.vercel.app");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Service registration form
  const [slug, setSlug] = useState("my-bsc-agent-api");
  const [name, setName] = useState("My Agent API");
  const [endpointUrl, setEndpointUrl] = useState("https://example.com/api/v1/intel");
  const [freeQuota, setFreeQuota] = useState("25");
  const [priceUsdt, setPriceUsdt] = useState("0.01");
  const [regNotice, setRegNotice] = useState<{ type: "ok" | "err"; text: string; tx?: string } | null>(
    null
  );

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/v1/status");
    if (res.ok) setData((await res.json()) as StatusData);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const copyText = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const triggerLive402 = async () => {
    setBusy(true);
    const start = performance.now();
    try {
      const res = await fetch(`/api/v1/bsc/safety-audit?address=${SAMPLE_WBNB_ADDRESS}`);
      const latencyMs = Math.round(performance.now() - start);
      const headerValue = res.headers.get("PAYMENT-REQUIRED") ?? "";
      const body = await res.json();
      setX402Response({
        status: res.status,
        headerValue,
        decoded: body.x402 ?? body,
        latencyMs,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegNotice(null);
    const contractAddr = data?.gate402ContractAddress ?? DEFAULT_GATE402_CONTRACT_ADDRESS;
    setBusy(true);
    try {
      const activeWallet = wallet ?? (await connectBscWallet());
      setWallet(activeWallet);
      const priceWei = BigInt(Math.round(Number(priceUsdt) * 1e6)) * 10n ** 12n;
      const tx = await sendRegisterServiceTx({
        account: activeWallet,
        contractAddress: contractAddr as Address,
        slug: slug.trim(),
        name: name.trim(),
        endpointUrl: endpointUrl.trim(),
        freeCallsPerDay: Number(freeQuota),
        priceUsdtWei: priceWei,
        payTo: activeWallet,
      });
      setRegNotice({
        type: "ok",
        text: "Service registered on-chain on BNB Smart Chain!",
        tx,
      });
      setTimeout(() => void loadStatus(), 5000);
    } catch (err) {
      setRegNotice({
        type: "err",
        text: err instanceof Error ? err.message : "Registration cancelled or failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  const contractAddr = data?.gate402ContractAddress ?? DEFAULT_GATE402_CONTRACT_ADDRESS;

  const codeSnippets: Record<CodeTab, { label: string; lang: string; code: string }> = {
    middleware: {
      label: "@gate402/middleware",
      lang: "TypeScript (Next.js / Edge / Node)",
      code: `import { evaluateGate402Request } from "@gate402/middleware";

export async function GET(request: Request) {
  const gate = await evaluateGate402Request(request, {
    serviceSlug: "${slug}",
    defaultFreeCallsPerDay: ${freeQuota || 25},
    priceUsdtWei: 10_000_000_000_000_000n, // ${priceUsdt || "0.01"} USDT on BSC
    payTo: "${wallet ?? "0xF32c652F5ee888E2b320641c023ded526F1364F8"}",
    gate402ContractAddress: "${contractAddr}",
  });
  if (!gate.allowed) {
    return Response.json({ x402: gate.x402Challenge?.payload }, { status: gate.status, headers: gate.headers });
  }
  return Response.json({ ok: true, agent: gate.handle }, { headers: gate.headers });
}`,
    },
    standalone: {
      label: "Standalone (Zero-Install)",
      lang: "Copy-paste single-file viem verifier",
      code: `import { createPublicClient, http, verifyMessage } from "viem";
import { bsc } from "viem/chains";

const client = createPublicClient({ chain: bsc, transport: http("https://bsc-dataseed.binance.org/") });
const GATE402 = "${contractAddr}";
const ABI = [{ type: "function", name: "hasActivePass", stateMutability: "view",
  inputs: [{ name: "wallet", type: "address" }],
  outputs: [{ name: "active", type: "bool" }, { name: "handle", type: "string" },
            { name: "passId", type: "uint64" }, { name: "streakDays", type: "uint32" }, { name: "lastDay", type: "uint64" }]
}] as const;

export async function verifyAgentIdPass(address: \`0x\${string}\`, message: string, sig: \`0x\${string}\`) {
  const validSig = await verifyMessage({ address, message, signature: sig });
  if (!validSig) return { allowed: false };
  const [active, handle] = await client.readContract({ address: GATE402, abi: ABI, functionName: "hasActivePass", args: [address] });
  return { allowed: active, handle: active ? \`\${handle}.ai\` : null };
}`,
    },
    mcp: {
      label: "Streamable MCP",
      lang: "JSON (Claude / Cursor / Binance Agent OS)",
      code: `{
  "mcpServers": {
    "gate402": {
      "type": "http",
      "url": "${origin}/api/mcp"
    }
  }
}`,
    },
    skill: {
      label: "baw SKILL.md",
      lang: "Binance Agentic Wallet CLI",
      code: `# Hosted live skill spec:
curl -sL ${origin}/skill.md

# Preview Pass activation (0 BNB, gas only — always confirm before execute):
baw contract-call preview \\
  --binanceChainId 56 \\
  --from <YOUR_AGENTIC_WALLET> \\
  --to ${contractAddr} \\
  --value 0 \\
  --inputData 0x01144d47 \\
  --json`,
    },
    solidity: {
      label: "Solidity Gate",
      lang: "1-Line On-Chain Gate on BNB Smart Chain",
      code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IGate402Registry {
    function hasActivePass(address wallet)
        external view returns (bool active, string memory handle, uint64 passId, uint32 streakDays, uint64 lastDay);
}

contract MyAgentDApp {
    IGate402Registry constant GATE = IGate402Registry(${contractAddr});

    modifier onlyVerifiedAgentPass() {
        (bool active, , , , ) = GATE.hasActivePass(msg.sender);
        require(active, "Activate free .ai Guard Pass on Gate402 first");
        _;
    }
}`,
    },
  };

  // Deduplicate flagship defaults by keccak256(slug) so localhost and production match on-chain services cleanly
  const onChainSlugHashes = new Set((data?.onChainServices ?? []).map((s) => s.slug.toLowerCase()));
  const mergedServices = [
    ...(data?.onChainServices ?? []).map((s) => ({
      key: `chain-${s.slug}`,
      name: s.name,
      badge: `${s.providerHandle}.ai · ON-CHAIN`,
      onChain: true,
      endpointUrl: s.endpointUrl,
      quotaLabel: `${s.freeCallsPerDay}–${s.freeCallsPerDay * 2} / day`,
      priceLabel: `${(Number(s.priceUsdtWei) / 1e18).toFixed(2)} USDT`,
    })),
    ...(data?.flagshipServices ?? [])
      .filter((f) => !onChainSlugHashes.has(serviceSlugHash(f.slug).toLowerCase()))
      .map((f) => ({
        key: `flagship-${f.slug}`,
        name: f.name,
        badge: "CORE GATEWAY",
        onChain: false,
        endpointUrl: `${f.method} ${f.endpointUrl}`,
        quotaLabel: `${f.freeCallsPerDay}–${f.freeCallsPerDay * 2} / day`,
        priceLabel: f.priceUsdtLabel,
      })),
  ];

  const traceSteps = [
    { step: "01", title: "Client Request", sub: "GET /v1/bsc/safety-audit", done: Boolean(x402Response) },
    {
      step: "02",
      title: "HTTP 402 Challenge",
      sub: "PAYMENT-REQUIRED (v2)",
      active: Boolean(x402Response),
      done: false,
    },
    { step: "03", title: "baw x402 Sign", sub: "0.01 USDT · Permit2", done: false },
    { step: "04", title: "200 OK + Receipt", sub: "PAYMENT-RESPONSE", done: false },
  ];

  const activeSnippet = codeSnippets[activeTab];

  return (
    <div className="space-y-10 sm:space-y-12">
      {/* Page Header */}
      <section className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-300">
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          Developer Workbench · Binance x402 v2 &amp; MCP
        </div>
        <h1
          id="main-content"
          tabIndex={-1}
          className="hero-title font-display font-bold text-white"
        >
          Monetize Overflow, Neutralize Bots in{" "}
          <span className="bg-gradient-to-r from-amber-300 to-emerald-400 bg-clip-text text-transparent">
            5 Lines of Code
          </span>
        </h1>
        <p className="prose-pretty text-slate-300 max-w-2xl text-sm sm:text-base">
          Register your API or MCP server on{" "}
          <code className="text-emerald-300">Gate402Registry</code> (
          <code className="text-slate-200">0x0844…e994</code>) to give every KYC-verified{" "}
          <code className="text-amber-300">.ai</code> Agent ID a Sybil-proof free daily tier — and
          settle paid overflow directly in BSC USDT via Binance Agentic Wallet.
        </p>
      </section>

      {/* ====================================================================
          SECTION 1: Interactive 4-Step HTTP 402 Wire-Trace Workbench
         ==================================================================== */}
      <section className="glass-panel rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <Terminal className="h-5 w-5 text-amber-400" aria-hidden="true" />
              Interactive HTTP 402 Wire-Trace Workbench
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Fires a live unauthenticated request to <code>/api/v1/bsc/safety-audit</code> and
              captures the real base64 <code>PAYMENT-REQUIRED</code> header accepted by{" "}
              <code>baw x402-payment preview</code>.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={triggerLive402}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-sm px-5 py-2.5 shadow-lg shadow-amber-500/15 cursor-pointer disabled:opacity-60"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {busy ? "Calling Live Endpoint…" : "Fire Live HTTP 402 Challenge"}
          </button>
        </div>

        {/* 4-Step Visual Wire-Trace Strip */}
        <ol className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {traceSteps.map((s) => (
            <li
              key={s.step}
              className={`rounded-xl border p-3 transition-all ${
                s.active
                  ? "border-amber-400/50 bg-amber-500/12 shadow-md shadow-amber-500/10"
                  : s.done
                    ? "border-emerald-500/35 bg-emerald-500/10"
                    : "border-slate-800/80 bg-[#050912]"
              }`}
            >
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className={s.active ? "text-amber-300 font-bold" : "text-slate-500"}>
                  STEP {s.step}
                </span>
                {s.done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />}
                {s.active && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 font-bold">
                    LIVE 402
                  </span>
                )}
              </div>
              <p className="mt-1 font-display text-sm font-bold text-white">{s.title}</p>
              <p className="font-mono text-[11px] text-slate-400 truncate">{s.sub}</p>
            </li>
          ))}
        </ol>

        {x402Response && (
          <div className="space-y-3 rounded-xl border border-amber-500/35 bg-[#050810] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 font-mono">
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                  HTTP {x402Response.status} Payment Required
                </span>
                <span className="text-slate-400">{x402Response.latencyMs}ms</span>
                <span className="text-emerald-400">Header: PAYMENT-REQUIRED</span>
              </div>
              {x402Response.headerValue && (
                <button
                  type="button"
                  onClick={() =>
                    void copyText(
                      "baw-cmd",
                      `baw x402-payment preview --paymentRequirements '${x402Response.headerValue}' --json`
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-1.5 font-mono cursor-pointer"
                >
                  {copiedId === "baw-cmd" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Copy baw x402 command
                </button>
              )}
            </div>
            <pre className="text-xs text-emerald-200 overflow-x-auto p-3.5 rounded-xl bg-[#03050a] border border-slate-800/90 max-h-72">
              {JSON.stringify(x402Response.decoded, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* ====================================================================
          SECTION 2: 5-Tab Integration Explorer + Register API On-Chain
         ==================================================================== */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left (7 cols): 5-Tab Code Integration Explorer */}
        <div className="lg:col-span-7 glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <Code2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
              Drop-In Integration Snippets
            </h2>
            <button
              type="button"
              onClick={() => void copyText(`code-${activeTab}`, activeSnippet.code)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#070d18] hover:border-emerald-400/50 text-slate-200 text-xs font-mono px-3 py-1.5 cursor-pointer"
            >
              {copiedId === `code-${activeTab}` ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy Code
                </>
              )}
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Integration code format"
            className="flex flex-nowrap overflow-x-auto gap-1.5 rounded-xl border border-slate-800 bg-[#050810] p-1.5"
          >
            {(Object.keys(codeSnippets) as CodeTab[]).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                role="tab"
                aria-selected={activeTab === tabKey}
                onClick={() => setActiveTab(tabKey)}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  activeTab === tabKey
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/35"
                    : "text-slate-400 hover:text-slate-100 border border-transparent"
                }`}
              >
                {codeSnippets[tabKey].label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-[#04070e] overflow-hidden">
            <div className="px-3.5 py-2 border-b border-slate-800/80 bg-[#080e1a] flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>{activeSnippet.lang}</span>
              <span className="text-emerald-400">BSC Chain 56</span>
            </div>
            <pre className="p-4 text-xs text-slate-200 overflow-x-auto leading-relaxed">
              {activeSnippet.code}
            </pre>
          </div>
        </div>

        {/* Right (5 cols): Register Your API On-Chain */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-amber-400" aria-hidden="true" />
              Register Your API On-Chain
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Publish your endpoint, free daily <code>.ai</code> quota, and BSC USDT overflow price
              directly to <code>Gate402Registry</code>.
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-3 text-sm">
            <div>
              <label htmlFor="svc-slug" className="block text-xs font-semibold text-slate-200">
                Service Slug
              </label>
              <span id="svc-slug-hint" className="block text-[11px] text-slate-400 mb-1">
                Lowercase letters, numbers, and hyphens (hashed to bytes32 on-chain).
              </span>
              <input
                id="svc-slug"
                type="text"
                required
                pattern="^[a-z0-9-]{3,40}$"
                aria-describedby="svc-slug-hint"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="field-input w-full rounded-xl border border-slate-700/90 bg-[#050810] px-3 py-2 font-mono text-xs text-slate-100"
              />
              <div className="field-error">Use 3–40 lowercase letters, digits, or hyphens.</div>
            </div>

            <div>
              <label htmlFor="svc-name" className="block text-xs font-semibold text-slate-200">
                Display Name
              </label>
              <input
                id="svc-name"
                type="text"
                required
                maxLength={64}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field-input mt-1 w-full rounded-xl border border-slate-700/90 bg-[#050810] px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="svc-url" className="block text-xs font-semibold text-slate-200">
                HTTPS Endpoint URL
              </label>
              <input
                id="svc-url"
                type="url"
                required
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                className="field-input mt-1 w-full rounded-xl border border-slate-700/90 bg-[#050810] px-3 py-2 font-mono text-xs text-slate-100"
              />
              <div className="field-error">Enter a valid https:// URL.</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="svc-quota" className="block text-xs font-semibold text-slate-200">
                  Free / .ai / Day
                </label>
                <input
                  id="svc-quota"
                  type="number"
                  required
                  min={1}
                  max={10000}
                  value={freeQuota}
                  onChange={(e) => setFreeQuota(e.target.value)}
                  className="field-input mt-1 w-full rounded-xl border border-slate-700/90 bg-[#050810] px-3 py-2 font-mono text-xs text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="svc-price" className="block text-xs font-semibold text-slate-200">
                  x402 Price (USDT)
                </label>
                <input
                  id="svc-price"
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  value={priceUsdt}
                  onChange={(e) => setPriceUsdt(e.target.value)}
                  className="field-input mt-1 w-full rounded-xl border border-slate-700/90 bg-[#050810] px-3 py-2 font-mono text-xs text-slate-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 font-bold text-sm px-4 py-2.5 cursor-pointer disabled:opacity-60"
            >
              <Wallet className="h-4 w-4" aria-hidden="true" />
              {busy ? "Confirm in Wallet…" : "Register Service On BSC Mainnet"}
            </button>

            {regNotice && (
              <div
                role={regNotice.type === "err" ? "alert" : "status"}
                className={`rounded-xl px-3 py-2 text-xs ${
                  regNotice.type === "ok"
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-200"
                    : "bg-rose-500/15 border border-rose-500/30 text-rose-200"
                }`}
              >
                <p>{regNotice.text}</p>
                {regNotice.tx && (
                  <a
                    href={`https://bscscan.com/tx/${regNotice.tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline font-mono mt-1"
                  >
                    BscScan Tx <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
          </form>
        </div>
      </section>

      {/* ====================================================================
          SECTION 3: Deduplicated Live Gate402 Services Directory
         ==================================================================== */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400 font-semibold">
              Live BSC Registry
            </p>
            <h2 className="section-heading font-display font-bold text-white mt-0.5">
              Registered Gate402 Services Directory
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {mergedServices.length} live endpoints
          </span>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="services-table-caption"
          className="table-wrapper"
        >
          <table className="data-table">
            <caption id="services-table-caption" className="visually-hidden">
              Live APIs protected by Gate402 Agent ID free tiers and x402 v2 BSC USDT overflow
            </caption>
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Endpoint</th>
                <th scope="col">Free Tier / .ai</th>
                <th scope="col">x402 Overflow</th>
              </tr>
            </thead>
            <tbody>
              {mergedServices.map((s) => (
                <tr key={s.key}>
                  <th scope="row" className="text-white">
                    <div className="flex flex-col items-start gap-1">
                      <span className="whitespace-nowrap">{s.name}</span>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${
                          s.onChain
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/35"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {s.badge}
                      </span>
                    </div>
                  </th>
                  <td
                    data-label="Endpoint"
                    className="font-mono text-xs text-emerald-300 [overflow-wrap:anywhere]"
                  >
                    {s.endpointUrl}
                  </td>
                  <td
                    data-label="Free Tier / .ai"
                    className="font-mono text-slate-200 whitespace-nowrap"
                  >
                    {s.quotaLabel}
                  </td>
                  <td
                    data-label="x402 Overflow"
                    className="font-mono font-semibold text-amber-300 whitespace-nowrap"
                  >
                    {s.priceLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

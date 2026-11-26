"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  Layers,
  Play,
  Terminal,
  Wallet,
} from "lucide-react";
import type { Address } from "viem";
import { SAMPLE_WBNB_ADDRESS } from "@/lib/config";
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

export function DeveloperPortal() {
  const [data, setData] = useState<StatusData | null>(null);
  const [wallet, setWallet] = useState<Address | null>(null);
  const [x402Response, setX402Response] = useState<{
    status: number;
    headerValue: string;
    decoded: unknown;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    try {
      const res = await fetch(
        `/api/v1/bsc/safety-audit?address=${SAMPLE_WBNB_ADDRESS}`
      );
      const headerValue = res.headers.get("PAYMENT-REQUIRED") ?? "";
      const body = await res.json();
      setX402Response({
        status: res.status,
        headerValue,
        decoded: body.x402 ?? body,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegNotice(null);
    if (!data?.gate402ContractAddress) {
      setRegNotice({
        type: "err",
        text: "Deploy Gate402Registry and set NEXT_PUBLIC_GATE402_CONTRACT_ADDRESS first.",
      });
      return;
    }
    setBusy(true);
    try {
      const activeWallet = wallet ?? (await connectBscWallet());
      setWallet(activeWallet);
      const priceWei = BigInt(Math.round(Number(priceUsdt) * 1e6)) * 10n ** 12n;
      const tx = await sendRegisterServiceTx({
        account: activeWallet,
        contractAddress: data.gate402ContractAddress as Address,
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

  const middlewareSnippet = `import { evaluateGate402Request } from "@gate402/middleware";

export async function GET(request: Request) {
  const gate = await evaluateGate402Request(request, {
    serviceSlug: "${slug}",
    defaultFreeCallsPerDay: ${freeQuota || 25},
    priceUsdtWei: 10_000_000_000_000_000n, // ${priceUsdt || "0.01"} USDT on BSC
    payTo: "${wallet ?? "0xYourBscRecipientAddress"}",
    gate402ContractAddress: "${data?.gate402ContractAddress ?? "0xDeployedGate402Registry"}",
  });
  if (!gate.allowed) {
    return Response.json({ x402: gate.x402Challenge?.payload }, { status: gate.status, headers: gate.headers });
  }
  return Response.json({ ok: true, agent: gate.handle }, { headers: gate.headers });
}`;

  const mcpSnippet = `{
  "mcpServers": {
    "gate402": {
      "type": "http",
      "url": "${typeof window !== "undefined" ? window.location.origin : "https://gate402.vercel.app"}/api/mcp"
    }
  }
}`;

  return (
    <div className="space-y-10">
      <section className="space-y-2">
        <h1
          id="main-content"
          tabIndex={-1}
          className="text-3xl font-extrabold tracking-tight text-white"
        >
          Developers, <span className="text-amber-400">x402 v2</span> &amp; MCP Gateway
        </h1>
        <p className="text-slate-300 max-w-3xl text-sm sm:text-base">
          Add Sybil-proof <code className="text-emerald-300">.ai</code> free daily quotas and
          automatic Binance Agentic Wallet <code className="text-amber-300">x402</code> BSC USDT
          overflow billing to any API or MCP server in 5 lines of TypeScript.
        </p>
      </section>

      {/* Live HTTP 402 Interactive Inspector */}
      <section className="rounded-2xl border border-slate-800 bg-[#0d1420] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Terminal className="h-5 w-5 text-amber-400" aria-hidden="true" />
              Live HTTP 402 (Binance x402 v2) Challenge Tester
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Calls <code>GET /api/v1/bsc/safety-audit</code> without a free .ai Pass signature to
              inspect the live base64 <code>PAYMENT-REQUIRED</code> header accepted by{" "}
              <code>baw x402-payment preview</code>.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={triggerLive402}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm px-4 py-2.5 cursor-pointer disabled:opacity-60"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Trigger Live HTTP 402
          </button>
        </div>

        {x402Response && (
          <div className="space-y-3 rounded-xl border border-amber-500/30 bg-[#070b12] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-mono font-bold text-amber-300">
                HTTP {x402Response.status} Payment Required · Header: PAYMENT-REQUIRED
              </span>
              {x402Response.headerValue && (
                <button
                  type="button"
                  onClick={() =>
                    void copyText(
                      "baw-cmd",
                      `baw x402-payment preview --paymentRequirements '${x402Response.headerValue}' --json`
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 font-mono cursor-pointer"
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
            <pre className="text-xs text-emerald-200 overflow-x-auto p-3 rounded-lg bg-slate-950 border border-slate-800">
              {JSON.stringify(x402Response.decoded, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* Register Service On-Chain + Drop-In SDK Code */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-800 bg-[#0d1420] p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            Register Your API / MCP Service On-Chain
          </h2>
          <p className="text-xs text-slate-400">
            Requires an active Gate402 .ai Pass. Sets your Sybil-proof free daily limit and BSC
            USDT overflow rate directly on <code>Gate402Registry</code>.
          </p>

          <form onSubmit={handleRegister} className="space-y-3.5 text-sm">
            <div>
              <label htmlFor="svc-slug" className="block text-slate-200 font-medium">
                Service Slug
              </label>
              <span id="svc-slug-hint" className="block text-xs text-slate-400 mb-1">
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
                className="field-input w-full rounded-xl border border-slate-700 bg-[#070c14] px-3 py-2 font-mono text-slate-100"
              />
              <div className="field-error">Use 3–40 lowercase letters, digits, or hyphens.</div>
            </div>

            <div>
              <label htmlFor="svc-name" className="block text-slate-200 font-medium">
                Display Name
              </label>
              <input
                id="svc-name"
                type="text"
                required
                maxLength={64}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field-input mt-1 w-full rounded-xl border border-slate-700 bg-[#070c14] px-3 py-2 text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="svc-url" className="block text-slate-200 font-medium">
                HTTPS Endpoint URL
              </label>
              <input
                id="svc-url"
                type="url"
                required
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                className="field-input mt-1 w-full rounded-xl border border-slate-700 bg-[#070c14] px-3 py-2 font-mono text-xs text-slate-100"
              />
              <div className="field-error">Enter a valid https:// URL.</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="svc-quota" className="block text-slate-200 font-medium">
                  Free Calls / .ai / Day
                </label>
                <input
                  id="svc-quota"
                  type="number"
                  required
                  min={1}
                  max={10000}
                  value={freeQuota}
                  onChange={(e) => setFreeQuota(e.target.value)}
                  className="field-input mt-1 w-full rounded-xl border border-slate-700 bg-[#070c14] px-3 py-2 font-mono text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="svc-price" className="block text-slate-200 font-medium">
                  x402 Overflow (USDT)
                </label>
                <input
                  id="svc-price"
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  value={priceUsdt}
                  onChange={(e) => setPriceUsdt(e.target.value)}
                  className="field-input mt-1 w-full rounded-xl border border-slate-700 bg-[#070c14] px-3 py-2 font-mono text-slate-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-4 py-2.5 cursor-pointer disabled:opacity-60"
            >
              <Wallet className="h-4 w-4" aria-hidden="true" />
              {busy ? "Confirm in Wallet…" : "Register Service On BSC Mainnet"}
            </button>

            {regNotice && (
              <div
                role={regNotice.type === "err" ? "alert" : "status"}
                className={`rounded-lg px-3 py-2 text-xs ${
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

        {/* Code Snippets */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-[#0d1420] p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Code2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                5-Line Middleware SDK
              </h2>
              <button
                type="button"
                onClick={() => void copyText("mw", middlewareSnippet)}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-2.5 py-1.5 cursor-pointer"
              >
                {copiedId === "mw" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Copy
              </button>
            </div>
            <pre className="text-xs text-slate-200 overflow-x-auto p-3.5 rounded-xl bg-[#070b12] border border-slate-800">
              {middlewareSnippet}
            </pre>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0d1420] p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Cpu className="h-5 w-5 text-amber-400" aria-hidden="true" />
                Streamable HTTP MCP Config
              </h2>
              <button
                type="button"
                onClick={() => void copyText("mcp", mcpSnippet)}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-2.5 py-1.5 cursor-pointer"
              >
                {copiedId === "mcp" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Copy
              </button>
            </div>
            <pre className="text-xs text-amber-200 overflow-x-auto p-3.5 rounded-xl bg-[#070b12] border border-slate-800">
              {mcpSnippet}
            </pre>
          </div>
        </div>
      </section>

      {/* Flagship + On-Chain Services Table */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold text-white">Live Gate402 Services Directory</h2>
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
              {(data?.flagshipServices ?? []).map((s) => (
                <tr key={s.slug}>
                  <th scope="row" className="text-white">
                    {s.name}
                  </th>
                  <td data-label="Endpoint" className="font-mono text-xs text-emerald-300">
                    {s.method} {s.endpointUrl}
                  </td>
                  <td data-label="Free Tier / .ai" className="font-mono text-slate-200">
                    {s.freeCallsPerDay}–{s.freeCallsPerDay * 2} / day
                  </td>
                  <td data-label="x402 Overflow" className="font-mono text-amber-300">
                    {s.priceUsdtLabel}
                  </td>
                </tr>
              ))}
              {(data?.onChainServices ?? []).map((s) => (
                <tr key={s.slug}>
                  <th scope="row" className="text-white">
                    {s.name}{" "}
                    <span className="font-mono text-xs text-amber-300">({s.providerHandle}.ai)</span>
                  </th>
                  <td data-label="Endpoint" className="font-mono text-xs text-emerald-300">
                    {s.endpointUrl}
                  </td>
                  <td data-label="Free Tier / .ai" className="font-mono text-slate-200">
                    {s.freeCallsPerDay}–{s.freeCallsPerDay * 2} / day
                  </td>
                  <td data-label="x402 Overflow" className="font-mono text-amber-300">
                    {(Number(s.priceUsdtWei) / 1e18).toFixed(4)} USDT
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

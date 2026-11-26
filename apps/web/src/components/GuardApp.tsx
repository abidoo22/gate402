"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Flame,
  Info,
  KeyRound,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wallet,
} from "lucide-react";
import type { Address } from "viem";
import { DEFAULT_GATE402_CONTRACT_ADDRESS, SAMPLE_WBNB_ADDRESS } from "@/lib/config";
import type { DexIntelReport, SafetyAuditReport } from "@/lib/bsc-intel";
import {
  connectBscWallet,
  sendActivatePassTx,
  sendRecordAuditTx,
  sendRefreshDailyPassTx,
  signGate402Headers,
} from "@/lib/wallet";

interface StatusPayload {
  agentIdRegistryAddress: string;
  gate402ContractAddress: string | null;
  stats: { passes: number; services: number; audits: number; checkIns: number };
  recentAudits: Array<{
    targetContract: string;
    auditorHandle: string;
    safetyScore: number;
    verdict: number;
    reportHash: string;
    timestamp: number;
  }>;
  walletStatus: {
    wallet: Address;
    hasAgentId: boolean;
    handle: string | null;
    passActive: boolean;
    passId: number;
    streakDays: number;
    checkedInToday: boolean;
  } | null;
}

const SHORT_ADDR = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const VERDICT_LABELS = ["SAFE", "CAUTION", "HIGH RISK"] as const;

export function GuardApp() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [wallet, setWallet] = useState<Address | null>(null);
  const [passMode, setPassMode] = useState<"agent" | "browser">("agent");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [txNotice, setTxNotice] = useState<{ type: "ok" | "err"; text: string; tx?: string } | null>(
    null
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [contractInput, setContractInput] = useState<string>(SAMPLE_WBNB_ADDRESS);
  const [inputTouched, setInputTouched] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [safetyReport, setSafetyReport] = useState<SafetyAuditReport | null>(null);
  const [dexReport, setDexReport] = useState<DexIntelReport | null>(null);
  const [accessBadge, setAccessBadge] = useState<string | null>(null);

  const fetchStatus = useCallback(async (addr?: Address | null) => {
    const query = addr ? `?wallet=${addr}` : "";
    const res = await fetch(`/api/v1/status${query}`);
    if (res.ok) {
      const data = (await res.json()) as StatusPayload;
      setStatus(data);
    }
  }, []);

  useEffect(() => {
    void fetchStatus(wallet);
  }, [fetchStatus, wallet]);

  const copyText = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setAnnouncement("Copied to clipboard.");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleConnect = async () => {
    setBusyAction("connect");
    setTxNotice(null);
    try {
      const addr = await connectBscWallet();
      setWallet(addr);
      await fetchStatus(addr);
      setAnnouncement(`Connected wallet ${SHORT_ADDR(addr)} on BNB Smart Chain.`);
    } catch (err) {
      setTxNotice({
        type: "err",
        text: err instanceof Error ? err.message : "Failed to connect wallet.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleActivatePass = async () => {
    const contractAddr = status?.gate402ContractAddress ?? DEFAULT_GATE402_CONTRACT_ADDRESS;
    if (!wallet) return;
    setBusyAction("activate");
    setTxNotice(null);
    try {
      const tx = await sendActivatePassTx(wallet, contractAddr as Address);
      setTxNotice({
        type: "ok",
        text: "Free .ai Guard Pass activation sent! Refreshing status shortly.",
        tx,
      });
      setAnnouncement("Guard Pass activation submitted on BSC.");
      setTimeout(() => void fetchStatus(wallet), 5_000);
    } catch (err) {
      setTxNotice({
        type: "err",
        text: err instanceof Error ? err.message : "Pass activation cancelled or failed.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRefreshPass = async () => {
    const contractAddr = status?.gate402ContractAddress ?? DEFAULT_GATE402_CONTRACT_ADDRESS;
    if (!wallet) return;
    setBusyAction("refresh");
    setTxNotice(null);
    try {
      const tx = await sendRefreshDailyPassTx(wallet, contractAddr as Address);
      setTxNotice({ type: "ok", text: "Daily 2x Quota Refresh submitted!", tx });
      setAnnouncement("Daily quota refresh submitted.");
      setTimeout(() => void fetchStatus(wallet), 5_000);
    } catch (err) {
      setTxNotice({
        type: "err",
        text: err instanceof Error ? err.message : "Daily refresh failed.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const runScan = async (useSamplePreview: boolean) => {
    setScanError(null);
    setSafetyReport(null);
    setDexReport(null);
    setAccessBadge(null);

    const target = useSamplePreview ? SAMPLE_WBNB_ADDRESS : contractInput.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(target)) {
      setInputTouched(true);
      setScanError("Enter a valid 42-character 0x BSC smart contract address.");
      return;
    }

    setBusyAction("scan");
    try {
      let headers: Record<string, string> = {};
      let dexHeaders: Record<string, string> = {};

      if (!useSamplePreview) {
        if (!wallet) {
          throw new Error(
            "Connect a wallet holding an active .ai Pass, use AI Agent Mode (baw CLI), or click 'Instant Live Preview (WBNB)' below."
          );
        }
        headers = await signGate402Headers(wallet, "bsc-safety-audit");
        dexHeaders = await signGate402Headers(wallet, "bsc-dex-intel");
      }

      const qs = useSamplePreview ? `?address=${target}&preview=sample` : `?address=${target}`;

      const [auditRes, dexRes] = await Promise.all([
        fetch(`/api/v1/bsc/safety-audit${qs}`, { headers }),
        fetch(`/api/v1/bsc/dex-intel${qs}`, { headers: dexHeaders }),
      ]);

      const auditJson = await auditRes.json();
      if (!auditRes.ok) {
        if (auditRes.status === 402) {
          throw new Error(
            `HTTP 402 Pass / Payment Required — ${auditJson.message ?? auditJson.error}`
          );
        }
        throw new Error(auditJson.message ?? auditJson.error ?? "Safety scan failed.");
      }

      setSafetyReport(auditJson.report as SafetyAuditReport);
      if (auditJson.access?.mode === "agent-id-free") {
        setAccessBadge(
          `Verified ${auditJson.access.handle} · ${auditJson.access.quotaRemaining}/${auditJson.access.quotaLimit} free scans left today`
        );
      } else {
        setAccessBadge("Live Mainnet Scan Preview (WBNB) · Activate your .ai Pass for any BSC contract");
      }

      if (dexRes.ok) {
        const dexJson = await dexRes.json();
        setDexReport(dexJson.report as DexIntelReport);
      }
      setAnnouncement(
        `Scan complete: score ${(auditJson.report as SafetyAuditReport).safetyScore} out of 100.`
      );
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Could not run scan.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleAnchorAudit = async () => {
    const contractAddr = status?.gate402ContractAddress ?? DEFAULT_GATE402_CONTRACT_ADDRESS;
    if (!wallet || !safetyReport) return;
    setBusyAction("anchor");
    setTxNotice(null);
    try {
      const tx = await sendRecordAuditTx({
        account: wallet,
        contractAddress: contractAddr as Address,
        targetContract: safetyReport.targetContract,
        safetyScore: safetyReport.safetyScore,
        verdictCode: safetyReport.verdictCode,
        reportHash: safetyReport.reportHash,
      });
      setTxNotice({
        type: "ok",
        text: "Audit proof digest anchored permanently on BNB Smart Chain!",
        tx,
      });
      setTimeout(() => void fetchStatus(wallet), 5_000);
    } catch (err) {
      setTxNotice({
        type: "err",
        text: err instanceof Error ? err.message : "Anchor transaction cancelled or failed.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const ws = status?.walletStatus;
  const contractAddr = status?.gate402ContractAddress ?? DEFAULT_GATE402_CONTRACT_ADDRESS;
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://web-nu-nine-yyzt7gth6g.vercel.app";

  const agentPrompt = `Read ${origin}/skill.md and help me activate my free 0-BNB Gate402 .ai Guard Pass on BNB Smart Chain (${contractAddr}, selector 0x01144d47) using my Binance Agentic Wallet. Preview the call first and wait for my confirmation before executing.`;

  const bawPreviewCmd = `baw contract-call preview --binanceChainId 56 --from <YOUR_AGENTIC_WALLET> --to ${contractAddr} --value 0 --inputData 0x01144d47 --json`;

  const isInputInvalid = inputTouched && !/^0x[a-fA-F0-9]{40}$/.test(contractInput.trim());

  return (
    <div className="space-y-8">
      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>

      {/* Sleek Compact Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-gradient-to-br from-[#0c1628] via-[#09111f] to-[#081a15] p-5 sm:p-8 shadow-2xl">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Agent ID Free Tier + x402 v2
          </span>
          <a
            href={`https://bscscan.com/address/${contractAddr}#code`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
          >
            Ownerless · BscScan Verified
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>

        <h1
          id="main-content"
          tabIndex={-1}
          className="mt-4 text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-snug sm:leading-tight max-w-3xl"
        >
          Sybil-Proof <span className="text-amber-400">.ai</span> Free API Access &amp; Live BSC
          Contract Guard
        </h1>

        <p className="mt-2.5 max-w-2xl text-slate-300 text-sm sm:text-base leading-relaxed">
          One verified <code className="text-emerald-300 font-semibold">name.ai</code> Agent ID
          unlocks <strong className="text-white">25–50 free daily BSC safety &amp; DEX scans</strong>{" "}
          — zero credit card, impossible to Sybil-farm, with automatic{" "}
          <code className="text-amber-300 font-semibold">HTTP 402</code> USDT overflow for AI agents.
        </p>

        {/* Compact 4-Metric Telemetry Bar */}
        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {[
            { label: "Active .ai Passes", value: status?.stats.passes ?? 0, accent: "text-emerald-400" },
            { label: "Live APIs", value: status?.stats.services ?? 3, accent: "text-amber-400" },
            { label: "On-Chain Audits", value: status?.stats.audits ?? 0, accent: "text-sky-400" },
            { label: "Daily Refreshes", value: status?.stats.checkIns ?? 0, accent: "text-white" },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-xl border border-slate-800/80 bg-[#070d18]/90 px-3.5 py-2.5"
            >
              <dt className="text-[11px] font-medium text-slate-400">{m.label}</dt>
              <dd className={`mt-0.5 text-xl sm:text-2xl font-bold font-mono ${m.accent}`}>
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Main Workspace Grid: Left = Agentic Pass Activation, Right = Live Scanner */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Pass Activation Card (Agent Mode FIRST because Binance isolates .ai Agentic Wallets!) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800/90 bg-[#0b111e] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-400 shrink-0" aria-hidden="true" />
              Activate .ai Guard Pass
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              0 BNB · Gas Only
            </span>
          </div>

          {/* Mode Toggle: AI Agent (Recommended for Binance Agentic Wallet) vs Browser Wallet */}
          <div
            role="tablist"
            aria-label="Pass activation method"
            className="grid grid-cols-2 rounded-xl border border-slate-800 bg-[#060a12] p-1 gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={passMode === "agent"}
              onClick={() => setPassMode("agent")}
              className={`min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                passMode === "agent"
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Bot className="h-3.5 w-3.5" aria-hidden="true" />
              AI Agent (baw CLI)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={passMode === "browser"}
              onClick={() => setPassMode("browser")}
              className={`min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                passMode === "browser"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              Browser Wallet
            </button>
          </div>

          {passMode === "agent" ? (
            <div className="space-y-3.5">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5 text-xs text-slate-300 leading-relaxed flex gap-2.5">
                <Info className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="text-emerald-300">Why AI Agent Mode?</strong> Binance isolates
                  your <code className="text-amber-300">.ai</code> Agentic Wallet from standard
                  mobile dApp browsers. Copy the prompt below into your AI agent (or run{" "}
                  <code className="text-slate-200">baw</code> locally) to activate Pass #1 directly
                  from your <code className="text-amber-300">name.ai</code> wallet.
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">
                    Option A — 1-Click Prompt for Any AI Agent
                  </span>
                  <a
                    href="/skill.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-emerald-400 hover:underline inline-flex items-center gap-1"
                  >
                    /skill.md <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#060a12] p-3 text-xs font-mono text-slate-300 leading-relaxed break-words">
                  {agentPrompt}
                </div>
                <button
                  type="button"
                  onClick={() => void copyText("prompt", agentPrompt)}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-4 py-2.5 transition-colors cursor-pointer"
                >
                  {copiedId === "prompt" ? (
                    <>
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Copied Agent Prompt!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copy Prompt for Your AI Agent
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                    Option B — Direct <code>baw</code> CLI Preview
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyText("baw", bawPreviewCmd)}
                    className="text-[11px] font-mono text-amber-300 hover:text-amber-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedId === "baw" ? (
                      <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    )}
                    Copy
                  </button>
                </div>
                <pre className="rounded-xl border border-slate-800 bg-[#060a12] p-2.5 text-[11px] font-mono text-amber-200/90 overflow-x-auto">
                  {bawPreviewCmd}
                </pre>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!wallet ? (
                <div className="rounded-xl border border-slate-800 bg-[#060a12] p-3.5 text-xs text-slate-300 leading-relaxed">
                  Connect an EVM browser wallet holding an <code className="text-amber-300">.ai</code>{" "}
                  Agent ID on BSC (Chain 56). Note: Binance App&apos;s dApp browser connects your
                  main MPC wallet — use the <strong>AI Agent (baw CLI)</strong> tab if your{" "}
                  <code className="text-amber-300">.ai</code> ID is on your isolated Agentic Wallet.
                </div>
              ) : ws?.hasAgentId ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">
                      Verified Agent ID
                    </span>
                    <span className="font-mono text-xs text-slate-400">{SHORT_ADDR(wallet)}</span>
                  </div>
                  <p className="text-2xl font-extrabold font-mono text-amber-300">
                    {ws.handle}.ai
                  </p>
                  {ws.passActive ? (
                    <div className="pt-2 border-t border-emerald-500/20 flex flex-wrap gap-3 text-xs text-emerald-200">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Pass #{ws.passId} Active
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Flame className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                        Streak: {ws.streakDays}d ({ws.checkedInToday ? "2x Quota" : "1x Base"})
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-300">
                      Verified! Activate your free on-chain Guard Pass once to unlock 25–50 free
                      scans/day.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 space-y-2 text-xs">
                  <p className="font-semibold text-amber-300">
                    Connected standard wallet {SHORT_ADDR(wallet)} (no .ai ID on this address)
                  </p>
                  <p className="text-slate-300 leading-relaxed">
                    Binance isolates your <code className="text-amber-200">.ai</code> Agentic Wallet
                    from the main dApp browser wallet. Switch to{" "}
                    <button
                      type="button"
                      onClick={() => setPassMode("agent")}
                      className="underline font-semibold text-emerald-300 cursor-pointer"
                    >
                      AI Agent (baw CLI)
                    </button>{" "}
                    to activate your Guard Pass directly from your Agentic Wallet.
                  </p>
                </div>
              )}

              {!wallet ? (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={busyAction === "connect"}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm px-4 py-2.5 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                  {busyAction === "connect" ? "Connecting…" : "Connect Browser Wallet"}
                </button>
              ) : ws?.hasAgentId && !ws.passActive ? (
                <button
                  type="button"
                  onClick={handleActivatePass}
                  disabled={busyAction === "activate"}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-4 py-2.5 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  {busyAction === "activate"
                    ? "Confirm in Wallet…"
                    : "Claim Free .ai Guard Pass (0 BNB)"}
                </button>
              ) : ws?.passActive && !ws.checkedInToday ? (
                <button
                  type="button"
                  onClick={handleRefreshPass}
                  disabled={busyAction === "refresh"}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm px-4 py-2.5 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Flame className="h-4 w-4" aria-hidden="true" />
                  {busyAction === "refresh" ? "Refreshing…" : "Refresh Daily Pass (2x Quota)"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void fetchStatus(wallet)}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 hover:border-emerald-400/50 bg-slate-900 text-slate-200 font-semibold text-sm px-4 py-2.5 transition-colors cursor-pointer"
                >
                  <Activity className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  Refresh On-Chain Status
                </button>
              )}
            </div>
          )}

          {txNotice && (
            <div
              role={txNotice.type === "err" ? "alert" : "status"}
              className={`rounded-xl px-3.5 py-2.5 text-xs ${
                txNotice.type === "ok"
                  ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-200"
                  : "bg-rose-500/15 border border-rose-500/30 text-rose-200"
              }`}
            >
              <p>{txNotice.text}</p>
              {txNotice.tx && (
                <a
                  href={`https://bscscan.com/tx/${txNotice.tx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 underline font-mono"
                >
                  View on BscScan <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Live BSC Smart Contract Safety & DEX Scanner */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800/90 bg-[#0b111e] p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Search className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
              Live BSC Contract Safety &amp; DEX Scanner
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Real-time GoPlus honeypot check, bytecode privilege scan, and PancakeSwap liquidity
              depth. Smart contracts only — personal wallets blocked.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runScan(false);
            }}
            className="space-y-3"
          >
            <div>
              <label htmlFor="contract-addr" className="block text-xs font-semibold text-slate-200">
                BSC Smart Contract Address
              </label>
              <span id="contract-addr-hint" className="block text-[11px] text-slate-400 mt-0.5 mb-1.5">
                Format: 42-character 0x contract address on BNB Smart Chain (Chain 56).
              </span>
              <input
                id="contract-addr"
                name="contractAddress"
                type="text"
                required
                pattern="^0x[a-fA-F0-9]{40}$"
                value={contractInput}
                onBlur={() => setInputTouched(true)}
                onChange={(e) => setContractInput(e.target.value)}
                aria-invalid={isInputInvalid ? "true" : "false"}
                aria-describedby={
                  isInputInvalid ? "contract-addr-hint contract-addr-error" : "contract-addr-hint"
                }
                placeholder="0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
                className={`field-input w-full rounded-xl border border-slate-700 bg-[#060a12] px-3.5 py-2.5 font-mono text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 ${
                  isInputInvalid ? "user-invalid-fallback" : ""
                }`}
              />
              <div id="contract-addr-error" className="field-error">
                <span role="img" aria-label="Error">
                  !
                </span>{" "}
                Enter a valid 0x smart contract address (42 hex characters).
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={busyAction === "scan"}
                onClick={() => {
                  setContractInput(SAMPLE_WBNB_ADDRESS);
                  void runScan(true);
                }}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-4 py-2.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                {busyAction === "scan" ? "Scanning BSC…" : "Instant Live Preview (WBNB)"}
              </button>
              <button
                type="submit"
                disabled={busyAction === "scan"}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 hover:border-amber-400/50 bg-[#0e1729] text-slate-100 font-semibold text-sm px-4 py-2.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                Scan Any Contract (.ai Pass)
              </button>
            </div>
          </form>

          {scanError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/35 bg-rose-950/25 p-3.5 text-xs sm:text-sm text-rose-200 flex items-start gap-2.5"
            >
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" aria-hidden="true" />
              <span>{scanError}</span>
            </div>
          )}

          {safetyReport && (
            <div className="rounded-xl border border-slate-700/80 bg-[#070c16] p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-300 font-mono font-semibold">
                    {safetyReport.tokenName
                      ? `${safetyReport.tokenName} (${safetyReport.tokenSymbol})`
                      : "BSC Smart Contract"}{" "}
                    · {SHORT_ADDR(safetyReport.targetContract)}
                  </p>
                  {accessBadge && (
                    <p className="mt-1 text-[11px] text-emerald-300 font-medium">{accessBadge}</p>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="text-right">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-400">
                      Safety Score
                    </span>
                    <span className="text-xl sm:text-2xl font-extrabold font-mono text-white">
                      {safetyReport.safetyScore}/100
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      safetyReport.verdict === "SAFE"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : safetyReport.verdict === "CAUTION"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                    }`}
                  >
                    {safetyReport.verdict}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
                  <span className="text-slate-400 text-[11px] block">Buy / Sell Tax</span>
                  <span className="font-mono font-semibold text-white">
                    {safetyReport.buyTaxPercent ?? 0}% / {safetyReport.sellTaxPercent ?? 0}%
                  </span>
                </div>
                <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
                  <span className="text-slate-400 text-[11px] block">Bytecode Size</span>
                  <span className="font-mono font-semibold text-white">
                    {safetyReport.bytecodeSizeBytes.toLocaleString()} B
                  </span>
                </div>
                <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
                  <span className="text-slate-400 text-[11px] block">DEX Liquidity</span>
                  <span className="font-mono font-semibold text-white">
                    {dexReport ? `$${dexReport.totalLiquidityUsd.toLocaleString()}` : "N/A"}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
                  <span className="text-slate-400 text-[11px] block">24h Volume</span>
                  <span className="font-mono font-semibold text-white">
                    {dexReport ? `$${dexReport.volume24hUsd.toLocaleString()}` : "N/A"}
                  </span>
                </div>
              </div>

              {safetyReport.flags.length > 0 && (
                <ul className="space-y-1.5">
                  {safetyReport.flags.map((flag) => (
                    <li
                      key={flag.code}
                      className={`rounded-lg px-3 py-2 text-xs border flex items-start gap-2 ${
                        flag.severity === "critical"
                          ? "bg-rose-950/30 border-rose-500/30 text-rose-200"
                          : flag.severity === "warn"
                            ? "bg-amber-950/30 border-amber-500/30 text-amber-200"
                            : "bg-slate-900/70 border-slate-800 text-slate-300"
                      }`}
                    >
                      {flag.severity === "info" ? (
                        <CheckCircle2
                          className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <AlertTriangle
                          className="h-4 w-4 shrink-0 mt-0.5 text-amber-400"
                          aria-hidden="true"
                        />
                      )}
                      <div>
                        <span className="font-semibold">{flag.title}:</span> {flag.detail}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] text-slate-400">{safetyReport.disclaimer}</span>
                {wallet && ws?.passActive && (
                  <button
                    type="button"
                    onClick={handleAnchorAudit}
                    disabled={busyAction === "anchor"}
                    className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-300 font-semibold text-xs px-3 py-1.5 cursor-pointer"
                  >
                    {busyAction === "anchor" ? "Anchoring…" : "Anchor Audit Digest On-Chain"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Recent On-Chain Verified Audits Table */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg sm:text-xl font-bold text-white">
            Recent On-Chain .ai Contract Audits
          </h2>
          <span className="text-xs text-slate-400">
            Signed by verified Binance Agent IDs · Smart contracts only
          </span>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="audits-table-caption"
          className="table-wrapper"
        >
          <table className="data-table">
            <caption id="audits-table-caption" className="visually-hidden">
              Recent on-chain BSC smart contract safety audits anchored by Gate402 Agent ID holders
            </caption>
            <thead>
              <tr>
                <th scope="col">Target Contract</th>
                <th scope="col">Auditor (.ai)</th>
                <th scope="col">Score</th>
                <th scope="col">Verdict</th>
                <th scope="col">Report Hash</th>
              </tr>
            </thead>
            <tbody>
              {status?.recentAudits && status.recentAudits.length > 0 ? (
                status.recentAudits.map((a, idx) => (
                  <tr key={`${a.reportHash}-${idx}`}>
                    <th scope="row" className="font-mono text-emerald-300">
                      <a
                        href={`https://bscscan.com/address/${a.targetContract}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {SHORT_ADDR(a.targetContract)}
                      </a>
                    </th>
                    <td data-label="Auditor (.ai)" className="font-mono text-amber-300">
                      {a.auditorHandle}.ai
                    </td>
                    <td data-label="Score" className="font-mono text-white">
                      {a.safetyScore}/100
                    </td>
                    <td data-label="Verdict">
                      <span className="font-semibold text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                        {VERDICT_LABELS[a.verdict] ?? "UNKNOWN"}
                      </span>
                    </td>
                    <td data-label="Report Hash" className="font-mono text-xs text-slate-400">
                      {SHORT_ADDR(a.reportHash)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <th scope="row" className="font-mono text-slate-300">
                    No audits anchored yet
                  </th>
                  <td data-label="Auditor (.ai)" className="text-slate-400">
                    Activate Pass #1 via AI Agent Mode
                  </td>
                  <td data-label="Score" className="text-slate-400">
                    —
                  </td>
                  <td data-label="Verdict" className="text-slate-400">
                    Try Instant Live Preview above
                  </td>
                  <td data-label="Report Hash" className="text-slate-400">
                    0 BNB gas-only digest
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

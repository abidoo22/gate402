"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Flame,
  Info,
  KeyRound,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wallet,
  Zap,
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
import { LiveProtocolRouter } from "@/components/LiveProtocolRouter";
import { AgentPassCard } from "@/components/AgentPassCard";
import { SafetyGauge } from "@/components/SafetyGauge";

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

const PRESET_CONTRACTS = [
  { label: "WBNB (Live Free Preview)", address: SAMPLE_WBNB_ADDRESS, preview: true },
  {
    label: "USDT (BSC)",
    address: "0x55d398326f99059fF775485246999027B3197955",
    preview: false,
  },
  {
    label: "Gate402Registry",
    address: DEFAULT_GATE402_CONTRACT_ADDRESS,
    preview: false,
  },
] as const;

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
  const [showRawJson, setShowRawJson] = useState(false);
  const [origin, setOrigin] = useState("https://web-nu-nine-yyzt7gth6g.vercel.app");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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

  const runScan = async (useSamplePreview: boolean, overrideAddr?: string) => {
    setScanError(null);
    setSafetyReport(null);
    setDexReport(null);
    setAccessBadge(null);
    setShowRawJson(false);

    const target = useSamplePreview
      ? SAMPLE_WBNB_ADDRESS
      : (overrideAddr ?? contractInput).trim();
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
        setAccessBadge("Live Mainnet Preview (WBNB) · Activate your .ai Pass for any BSC contract");
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

  const agentPrompt = `Read ${origin}/skill.md and help me activate my free 0-BNB Gate402 .ai Guard Pass on BNB Smart Chain (${contractAddr}, selector 0x01144d47) using my Binance Agentic Wallet. Preview the call first and wait for my confirmation before executing.`;

  const bawPreviewCmd = `baw contract-call preview --binanceChainId 56 --from <YOUR_AGENTIC_WALLET> --to ${contractAddr} --value 0 --inputData 0x01144d47 --json`;

  const isInputInvalid = inputTouched && !/^0x[a-fA-F0-9]{40}$/.test(contractInput.trim());

  return (
    <div className="space-y-12 sm:space-y-16">
      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>

      {/* ====================================================================
          SECTION 1: Asymmetric Split Flagship Hero + Live Protocol Visualizer
         ==================================================================== */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 items-center">
        <div className="lg:col-span-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono font-semibold uppercase tracking-wider">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/12 text-emerald-300 border border-emerald-400/30">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Agent ID Free Tier + x402 v2
            </span>
            <a
              href={`https://bscscan.com/address/${contractAddr}#code`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-400/30 hover:bg-amber-500/20 transition-colors"
            >
              Ownerless · BscScan
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>

          <h1
            id="main-content"
            tabIndex={-1}
            className="hero-title font-display font-bold text-white"
          >
            Sybil-Proof{" "}
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-emerald-400 bg-clip-text text-transparent">
              .ai
            </span>{" "}
            Free API Access &amp; Live BSC Guard
          </h1>

          <p className="prose-pretty text-slate-300 text-sm sm:text-base max-w-[56ch]">
            AI agents don&apos;t have credit cards — and bots drain free tiers in minutes.{" "}
            <strong className="text-white">Gate402</strong> binds{" "}
            <strong className="text-emerald-300">25–50 free daily BSC safety &amp; DEX scans</strong>{" "}
            to every KYC-verified <code className="text-amber-300">name.ai</code> Agent ID, then
            seamlessly routes overflow traffic to{" "}
            <code className="text-amber-300">HTTP 402</code> BSC USDT micropayments.
          </p>

          {/* Dual Primary CTAs */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="#scanner-workspace"
              onClick={() => {
                setContractInput(SAMPLE_WBNB_ADDRESS);
                void runScan(true);
              }}
              className="btn-target inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 font-bold text-sm px-5 py-3 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Run Instant WBNB Scan
            </a>
            <a
              href="#pass-workspace"
              className="btn-target inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700/90 hover:border-amber-400/50 bg-[#0b1222] text-slate-100 font-semibold text-sm px-5 py-3 transition-colors"
            >
              Activate .ai Guard Pass
              <ArrowRight className="h-4 w-4 text-amber-400" aria-hidden="true" />
            </a>
          </div>

          {/* Live On-Chain Telemetry Strip */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5 pt-2">
            {[
              { label: "Active .ai Passes", value: status?.stats.passes ?? 0, tone: "text-emerald-400" },
              { label: "On-Chain APIs", value: status?.stats.services ?? 3, tone: "text-amber-300" },
              { label: "Anchored Audits", value: status?.stats.audits ?? 0, tone: "text-sky-300" },
              { label: "Quota Refreshes", value: status?.stats.checkIns ?? 0, tone: "text-white" },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-slate-800/80 bg-[#080e1a]/90 px-3 py-2.5"
              >
                <dt className="text-[11px] font-medium text-slate-400">{m.label}</dt>
                <dd className={`mt-0.5 text-xl font-bold font-mono ${m.tone}`}>{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Right Column: Interactive Vault-Chronometer Live Protocol Router */}
        <div className="lg:col-span-7">
          <LiveProtocolRouter />
        </div>
      </section>

      {/* ====================================================================
          SECTION 2: Main Workspace (Holographic Pass Card + Mission-Control Scanner)
         ==================================================================== */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Collectible Holographic Pass Card + Activation Controls */}
        <div id="pass-workspace" className="lg:col-span-5 space-y-4 scroll-mt-20">
          <AgentPassCard
            handle={ws?.handle ?? null}
            passActive={Boolean(ws?.passActive)}
            passId={ws?.passId ?? 0}
            streakDays={ws?.streakDays ?? 1}
            checkedInToday={Boolean(ws?.checkedInToday)}
            walletShort={wallet ? SHORT_ADDR(wallet) : null}
          />

          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                Activate Your Pass
              </h2>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                0 BNB · Gas Only
              </span>
            </div>

            <div
              role="tablist"
              aria-label="Pass activation method"
              className="grid grid-cols-2 rounded-xl border border-slate-800 bg-[#050810] p-1 gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={passMode === "agent"}
                onClick={() => setPassMode("agent")}
                className={`min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  passMode === "agent"
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/35"
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
                    ? "bg-amber-500/15 text-amber-300 border border-amber-400/35"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                Browser Wallet
              </button>
            </div>

            {passMode === "agent" ? (
              <div className="space-y-3.5">
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3 text-xs text-slate-300 leading-relaxed flex gap-2.5">
                  <Info className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="prose-pretty">
                    Binance isolates your <code className="text-amber-300">.ai</code> Agentic Wallet
                    from standard dApp browsers. Paste this 1-line prompt into your AI agent (or run{" "}
                    <code className="text-slate-200">baw</code> locally) to activate directly from
                    your <code className="text-amber-300">name.ai</code> wallet.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">
                      1-Click AI Agent Prompt
                    </span>
                    <a
                      href="/skill.md"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1"
                    >
                      /skill.md <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-[#050810] p-3 text-[11px] font-mono text-slate-300 leading-relaxed break-words">
                    {agentPrompt}
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyText("prompt", agentPrompt)}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 font-bold text-sm px-4 py-2.5 transition-all cursor-pointer"
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
                      Direct <code>baw</code> CLI Preview
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
                  <pre className="rounded-xl border border-slate-800 bg-[#050810] p-2.5 text-[11px] font-mono text-amber-200/90 overflow-x-auto">
                    {bawPreviewCmd}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                {!wallet ? (
                  <p className="rounded-xl border border-slate-800 bg-[#050810] p-3.5 text-xs text-slate-300 leading-relaxed">
                    Connect an EVM wallet holding a claimed <code className="text-amber-300">.ai</code>{" "}
                    Agent ID on BSC (Chain 56). Note: Binance App&apos;s dApp browser injects your
                    main MPC wallet — use the <strong>AI Agent (baw CLI)</strong> tab for isolated
                    Agentic Wallets.
                  </p>
                ) : ws?.hasAgentId ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-xs text-emerald-200 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                      Verified handle: <span className="font-mono text-amber-300">{ws.handle}.ai</span>
                    </p>
                    <p className="text-slate-300">
                      {ws.passActive
                        ? `Pass #${ws.passId} is active (${ws.checkedInToday ? "50/day 2x quota" : "25/day base quota"}).`
                        : "Activate your lifetime 0-BNB Guard Pass below to unlock free daily scans."}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 space-y-1.5 text-xs">
                    <p className="font-semibold text-amber-300">
                      Connected standard wallet {SHORT_ADDR(wallet)} (no .ai ID on this address)
                    </p>
                    <p className="text-slate-300 leading-relaxed">
                      Switch to{" "}
                      <button
                        type="button"
                        onClick={() => setPassMode("agent")}
                        className="underline font-semibold text-emerald-300 cursor-pointer"
                      >
                        AI Agent (baw CLI)
                      </button>{" "}
                      to activate directly from your isolated Agentic Wallet.
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
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 hover:border-emerald-400/50 bg-[#0b1322] text-slate-200 font-semibold text-sm px-4 py-2.5 transition-colors cursor-pointer"
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
        </div>

        {/* Right Column: Mission-Control BSC Safety & DEX Scanner */}
        <div
          id="scanner-workspace"
          className="lg:col-span-7 glass-panel rounded-2xl p-5 sm:p-6 space-y-5 scroll-mt-20"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Search className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
                Live BSC Contract Safety &amp; DEX Scanner
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-400 prose-pretty">
                Aggregates GoPlus BSC honeypot analysis, bytecode privilege selectors, Sourcify
                verification, and live PancakeSwap liquidity. Personal wallets blocked by design.
              </p>
            </div>
          </div>

          {/* Quick-Select Preset Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              Quick Targets:
            </span>
            {PRESET_CONTRACTS.map((preset) => (
              <button
                key={preset.address}
                type="button"
                onClick={() => {
                  setContractInput(preset.address);
                  if (preset.preview) {
                    void runScan(true, preset.address);
                  }
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-mono border transition-colors cursor-pointer ${
                  preset.preview
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    : "border-slate-800 bg-[#060b14] text-slate-300 hover:border-amber-400/40 hover:text-amber-200"
                }`}
              >
                {preset.label}
              </button>
            ))}
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
                className={`field-input w-full rounded-xl border border-slate-700/90 bg-[#050810] px-3.5 py-3 font-mono text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 ${
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
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 font-bold text-sm px-4 py-2.5 shadow-md shadow-emerald-500/15 transition-all cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                {busyAction === "scan" ? "Scanning BSC…" : "Instant Live Preview (WBNB)"}
              </button>
              <button
                type="submit"
                disabled={busyAction === "scan"}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700/90 hover:border-amber-400/50 bg-[#0d1629] text-slate-100 font-semibold text-sm px-4 py-2.5 transition-colors cursor-pointer disabled:opacity-60"
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

          {safetyReport ? (
            <div className="rounded-2xl border border-slate-700/80 bg-[#050912] p-4 sm:p-5 space-y-5">
              {/* Top Report Summary + Radial SVG Gauge */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800/80">
                <div className="min-w-0 flex-1">
                  <SafetyGauge score={safetyReport.safetyScore} verdict={safetyReport.verdict} />
                </div>
                <div className="space-y-1.5 sm:text-right sm:max-w-[230px] shrink-0">
                  <p className="font-display text-base font-bold text-white leading-snug">
                    {safetyReport.tokenName
                      ? `${safetyReport.tokenName} (${safetyReport.tokenSymbol})`
                      : "BSC Smart Contract"}
                  </p>
                  <a
                    href={`https://bscscan.com/address/${safetyReport.targetContract}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-emerald-400 hover:underline"
                  >
                    {SHORT_ADDR(safetyReport.targetContract)}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  {accessBadge && (
                    <p className="text-[11px] font-mono text-amber-300/90 leading-snug">
                      {accessBadge}
                    </p>
                  )}
                </div>
              </div>

              {/* 4 Glass Metric KPI Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="rounded-xl bg-[#0b1220] border border-slate-800/90 p-3">
                  <span className="text-slate-400 text-[11px] block">Buy / Sell Tax</span>
                  <span className="mt-0.5 block font-mono font-bold text-sm text-white">
                    {safetyReport.buyTaxPercent ?? 0}% / {safetyReport.sellTaxPercent ?? 0}%
                  </span>
                </div>
                <div className="rounded-xl bg-[#0b1220] border border-slate-800/90 p-3">
                  <span className="text-slate-400 text-[11px] block">Bytecode Size</span>
                  <span className="mt-0.5 block font-mono font-bold text-sm text-white">
                    {safetyReport.bytecodeSizeBytes.toLocaleString()} B
                  </span>
                </div>
                <div className="rounded-xl bg-[#0b1220] border border-slate-800/90 p-3">
                  <span className="text-slate-400 text-[11px] block">DEX Liquidity</span>
                  <span className="mt-0.5 block font-mono font-bold text-sm text-emerald-300">
                    {dexReport ? `$${dexReport.totalLiquidityUsd.toLocaleString()}` : "N/A"}
                  </span>
                </div>
                <div className="rounded-xl bg-[#0b1220] border border-slate-800/90 p-3">
                  <span className="text-slate-400 text-[11px] block">24h Volume</span>
                  <span className="mt-0.5 block font-mono font-bold text-sm text-amber-300">
                    {dexReport ? `$${dexReport.volume24hUsd.toLocaleString()}` : "N/A"}
                  </span>
                </div>
              </div>

              {/* Risk Findings Checklist */}
              {safetyReport.flags.length > 0 && (
                <ul className="space-y-2">
                  {safetyReport.flags.map((flag) => (
                    <li
                      key={flag.code}
                      className={`rounded-xl px-3.5 py-2.5 text-xs border flex items-start gap-2.5 ${
                        flag.severity === "critical"
                          ? "bg-rose-950/30 border-rose-500/35 text-rose-200"
                          : flag.severity === "warn"
                            ? "bg-amber-950/25 border-amber-500/35 text-amber-200"
                            : "bg-slate-900/75 border-slate-800 text-slate-300"
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
                        <span className="font-semibold text-white">{flag.title}:</span>{" "}
                        {flag.detail}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Footer Actions: Raw JSON Toggle + Anchor Digest */}
              <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowRawJson((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-emerald-300 cursor-pointer"
                >
                  <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {showRawJson ? "Hide Raw Agent JSON" : "Inspect Raw Agent JSON"}
                </button>

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

              {showRawJson && (
                <pre className="rounded-xl border border-slate-800 bg-[#03060c] p-3 text-[11px] font-mono text-emerald-200/90 overflow-x-auto max-h-64">
                  {JSON.stringify({ safetyReport, dexReport }, null, 2)}
                </pre>
              )}

              <p className="text-[11px] text-slate-500">{safetyReport.disclaimer}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-800 bg-[#050912]/70 p-6 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-200">
                Ready for live BSC Mainnet inspection
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Click <strong className="text-emerald-300">Instant Live Preview (WBNB)</strong>{" "}
                above to see a live GoPlus + PancakeSwap safety report with zero wallet setup.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ====================================================================
          SECTION 3: 3-Card Architectural Bento Strip
         ==================================================================== */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400 font-semibold">
              Protocol Architecture
            </p>
            <h2 className="section-heading font-display font-bold text-white mt-1">
              Why Removing Binance Agent ID Breaks Gate402
            </h2>
          </div>
          <a
            href="/developers"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200"
          >
            Explore Developer Workbench <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: ShieldCheck,
              accent: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
              tag: "SYBIL RESISTANCE",
              title: "1 KYC Human = 1 Quota",
              body: "Gate402Registry atomically checks balanceOf, handleOf, and ownerOfHandle against SPACE ID HandleRegistry (0x60B9…022F). Spinning up 1,000 burner wallets yields zero extra free calls.",
            },
            {
              icon: Zap,
              accent: "text-amber-400 border-amber-500/30 bg-amber-500/10",
              tag: "X402 V2 OVERFLOW",
              title: "Zero Credit Cards Needed",
              body: "When an AI agent exceeds its 25–50 daily free calls, Gate402 emits RFC-compliant HTTP 402 PAYMENT-REQUIRED headers (eip155:56 BSC USDT/USDC) natively signed by baw x402-payment.",
            },
            {
              icon: Lock,
              accent: "text-sky-400 border-sky-500/30 bg-sky-500/10",
              tag: "IMMUTABLE SAFETY",
              title: "Ownerless & Contract-Only",
              body: "Zero admin keys, zero fund custody, zero web QR login. Both our Solidity contract and API reject EOA addresses so Agent ID can never be abused for personal wallet stalking.",
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <article
                key={card.title}
                className="glass-panel rounded-2xl p-5 space-y-3 hover:border-slate-700/90 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${card.accent}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-[10px] tracking-widest text-slate-400">
                    {card.tag}
                  </span>
                </div>
                <h3 className="font-display text-base font-bold text-white">{card.title}</h3>
                <p className="prose-pretty text-xs text-slate-400 leading-relaxed">{card.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ====================================================================
          SECTION 4: Live On-Chain Verified Contract Audits Ledger
         ==================================================================== */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-amber-400 font-semibold">
              Immutable Mainnet Ledger
            </p>
            <h2 className="section-heading font-display font-bold text-white mt-0.5">
              Recent On-Chain .ai Contract Audits
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Cryptographically anchored on BSC Mainnet · Smart contracts only
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
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        {SHORT_ADDR(a.targetContract)}
                        <ExternalLink className="h-3 w-3 opacity-75" aria-hidden="true" />
                      </a>
                    </th>
                    <td data-label="Auditor (.ai)" className="font-mono font-semibold text-amber-300">
                      {a.auditorHandle}.ai
                    </td>
                    <td data-label="Score" className="font-mono font-bold text-white">
                      {a.safetyScore}/100
                    </td>
                    <td data-label="Verdict">
                      <span
                        className={`font-mono font-bold text-[11px] px-2.5 py-0.5 rounded-full border ${
                          a.verdict === 0
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/35"
                            : a.verdict === 1
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/35"
                              : "bg-rose-500/15 text-rose-300 border-rose-500/35"
                        }`}
                      >
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
                    Loading live BSC audits…
                  </th>
                  <td data-label="Auditor (.ai)" className="text-slate-400">
                    —
                  </td>
                  <td data-label="Score" className="text-slate-400">
                    —
                  </td>
                  <td data-label="Verdict" className="text-slate-400">
                    —
                  </td>
                  <td data-label="Report Hash" className="text-slate-400">
                    —
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

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Flame,
  KeyRound,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { Address } from "viem";
import { SAMPLE_WBNB_ADDRESS } from "@/lib/config";
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
    if (!wallet || !status?.gate402ContractAddress) {
      setTxNotice({
        type: "err",
        text: "Gate402Registry contract address is not yet configured in environment variables.",
      });
      return;
    }
    setBusyAction("activate");
    setTxNotice(null);
    try {
      const tx = await sendActivatePassTx(wallet, status.gate402ContractAddress as Address);
      setTxNotice({
        type: "ok",
        text: "Free .ai Guard Pass activation transaction sent! Waiting a few seconds to refresh on-chain status.",
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
    if (!wallet || !status?.gate402ContractAddress) return;
    setBusyAction("refresh");
    setTxNotice(null);
    try {
      const tx = await sendRefreshDailyPassTx(wallet, status.gate402ContractAddress as Address);
      setTxNotice({
        type: "ok",
        text: "Daily 2x Quota Refresh transaction submitted!",
        tx,
      });
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
            "Connect your Binance Agent ID (.ai) wallet to scan any BSC contract, or click 'Preview Live WBNB Scan'."
          );
        }
        headers = await signGate402Headers(wallet, "bsc-safety-audit");
        dexHeaders = await signGate402Headers(wallet, "bsc-dex-intel");
      }

      const qs = useSamplePreview
        ? `?address=${target}&preview=sample`
        : `?address=${target}`;

      const [auditRes, dexRes] = await Promise.all([
        fetch(`/api/v1/bsc/safety-audit${qs}`, { headers }),
        fetch(`/api/v1/bsc/dex-intel${qs}`, { headers: dexHeaders }),
      ]);

      const auditJson = await auditRes.json();
      if (!auditRes.ok) {
        if (auditRes.status === 402) {
          throw new Error(
            `HTTP 402 Payment / Pass Required: ${auditJson.message ?? auditJson.error}`
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
        setAccessBadge("Live Sample Preview (WBNB) · Connect .ai Pass for any BSC contract");
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
    if (!wallet || !safetyReport || !status?.gate402ContractAddress) {
      setTxNotice({
        type: "err",
        text: "Connect an active .ai Guard Pass wallet with a deployed Gate402Registry to anchor audits on-chain.",
      });
      return;
    }
    setBusyAction("anchor");
    setTxNotice(null);
    try {
      const tx = await sendRecordAuditTx({
        account: wallet,
        contractAddress: status.gate402ContractAddress as Address,
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
  const isInputInvalid = inputTouched && !/^0x[a-fA-F0-9]{40}$/.test(contractInput.trim());

  return (
    <div className="space-y-10">
      {/* Single polite live region for assistive-tech status updates */}
      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>

      {/* Hero Section */}
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-[#0c1626] via-[#09111d] to-[#081915] p-6 sm:p-10 shadow-2xl">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Sybil-Proof .ai Free Tier + Native x402 v2
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Ownerless · Non-Custodial · BSC Mainnet
          </span>
        </div>

        <h1
          id="main-content"
          tabIndex={-1}
          className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight"
        >
          1 Verified <span className="text-amber-400">.ai</span> Agent ID = Sybil-Proof Free API
          Access &amp; Instant BSC Scam Protection
        </h1>

        <p className="mt-3 max-w-3xl text-slate-300 text-base leading-relaxed">
          AI agents have no credit cards, and free APIs get drained by Sybil bot farms.{" "}
          <strong className="text-white">Gate402</strong> uses Binance&apos;s non-transferable{" "}
          <code className="text-emerald-300">name.ai</code> Agent ID to grant{" "}
          <strong className="text-emerald-300">25–50 free daily BSC safety &amp; DEX scans</strong>{" "}
          per real human — then seamlessly transitions overflow traffic to{" "}
          <code className="text-amber-300">HTTP 402</code> USDT micropayments.
        </p>

        {/* Live On-Chain Telemetry */}
        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active .ai Passes", value: status?.stats.passes ?? 0 },
            { label: "Registered APIs", value: status?.stats.services ?? 3 },
            { label: "On-Chain Audits", value: status?.stats.audits ?? 0 },
            { label: "Daily Quota Refreshes", value: status?.stats.checkIns ?? 0 },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-xl border border-slate-800/90 bg-[#0b1220]/80 px-4 py-3"
            >
              <dt className="text-xs text-slate-400">{m.label}</dt>
              <dd className="mt-1 text-2xl font-bold font-mono text-white">{m.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Guard Pass Card + Status */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#0d1420] p-6 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-400" aria-hidden="true" />
                Your .ai Guard Pass
              </h2>
              <span className="text-xs font-mono text-slate-400">0 BNB · Gas Only</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Verified live against SPACE ID{" "}
              <code className="text-slate-200">HandleRegistry</code> (
              <code className="text-slate-300">0x60B9…022F</code>). Zero custody, zero approvals.
            </p>

            {!wallet ? (
              <div className="mt-5 rounded-xl border border-slate-800 bg-[#080e18] p-4 text-sm text-slate-300">
                Connect your BSC wallet holding a claimed <code className="text-amber-300">.ai</code>{" "}
                Agent ID to activate your lifetime free API pass.
              </div>
            ) : ws?.hasAgentId ? (
              <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-emerald-300 font-semibold">
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
                      Streak: {ws.streakDays}d ({ws.checkedInToday ? "2x Quota Active" : "1x Base"})
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-300">
                    Your .ai handle is verified! Activate your free on-chain Guard Pass once to
                    unlock 25–50 free calls/day across all Gate402 endpoints.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-2 text-sm">
                <p className="font-semibold text-amber-300">
                  No .ai Agent ID detected on {SHORT_ADDR(wallet)}
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Claim your free permanent <code className="text-amber-200">name.ai</code> inside
                  the Binance App: <strong>Wallet → Web3 Wallet → Agent ID banner</strong>, then
                  reconnect here. Or pay 0.01 USDT/call via x402 v2.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            {!wallet ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={busyAction === "connect"}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-4 py-3 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Wallet className="h-4 w-4" aria-hidden="true" />
                {busyAction === "connect" ? "Connecting Wallet…" : "Connect BSC Wallet"}
              </button>
            ) : ws?.hasAgentId && !ws.passActive ? (
              <button
                type="button"
                onClick={handleActivatePass}
                disabled={busyAction === "activate"}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-4 py-3 transition-colors cursor-pointer disabled:opacity-60"
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
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm px-4 py-3 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Flame className="h-4 w-4" aria-hidden="true" />
                {busyAction === "refresh"
                  ? "Refreshing Quota…"
                  : "Refresh Daily Pass (Unlock 2x Quota)"}
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

            {txNotice && (
              <div
                role={txNotice.type === "err" ? "alert" : "status"}
                className={`rounded-lg px-3 py-2 text-xs ${
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

        {/* Live BSC Smart Contract Safety Scanner */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-800 bg-[#0d1420] p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Search className="h-5 w-5 text-emerald-400" aria-hidden="true" />
              Live BSC Smart Contract Safety &amp; DEX Scanner
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Scan any BNB Smart Chain token or mint contract for honeypots, hidden owners, taxes,
              and PancakeSwap liquidity depth. Personal EOA wallets are blocked by design.
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
              <label htmlFor="contract-addr" className="block text-sm font-medium text-slate-200">
                BSC Smart Contract Address
              </label>
              <span id="contract-addr-hint" className="block text-xs text-slate-400 mt-0.5 mb-1.5">
                Format: 42-character 0x contract address on BNB Smart Chain (chain 56).
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
                className={`field-input w-full rounded-xl border border-slate-700 bg-[#070c14] px-3.5 py-2.5 font-mono text-sm text-slate-100 placeholder:text-slate-500 ${
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

            <div className="flex flex-wrap gap-2.5">
              <button
                type="submit"
                disabled={busyAction === "scan"}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-5 py-2.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {busyAction === "scan" ? "Scanning BSC…" : "Scan With .ai Pass"}
              </button>
              <button
                type="button"
                disabled={busyAction === "scan"}
                onClick={() => {
                  setContractInput(SAMPLE_WBNB_ADDRESS);
                  void runScan(true);
                }}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 hover:border-amber-400/50 bg-slate-900 text-slate-200 font-semibold text-sm px-4 py-2.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4 text-amber-400" aria-hidden="true" />
                Preview Live WBNB Scan
              </button>
            </div>
          </form>

          {scanError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3.5 text-sm text-rose-200 flex items-start gap-2.5"
            >
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-rose-400" aria-hidden="true" />
              <span>{scanError}</span>
            </div>
          )}

          {safetyReport && (
            <div className="rounded-xl border border-slate-700/80 bg-[#080d16] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400 font-mono">
                    {safetyReport.tokenName
                      ? `${safetyReport.tokenName} (${safetyReport.tokenSymbol})`
                      : "BSC Smart Contract"}{" "}
                    · {SHORT_ADDR(safetyReport.targetContract)}
                  </p>
                  {accessBadge && (
                    <p className="mt-1 text-xs text-emerald-300 font-medium">{accessBadge}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="block text-xs text-slate-400">Safety Score</span>
                    <span className="text-2xl font-extrabold font-mono text-white">
                      {safetyReport.safetyScore}/100
                    </span>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
                  <span className="text-slate-400 block">Buy / Sell Tax</span>
                  <span className="font-mono font-semibold text-white">
                    {safetyReport.buyTaxPercent ?? 0}% / {safetyReport.sellTaxPercent ?? 0}%
                  </span>
                </div>
                <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
                  <span className="text-slate-400 block">Bytecode Size</span>
                  <span className="font-mono font-semibold text-white">
                    {safetyReport.bytecodeSizeBytes.toLocaleString()} B
                  </span>
                </div>
                <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
                  <span className="text-slate-400 block">DEX Liquidity</span>
                  <span className="font-mono font-semibold text-white">
                    {dexReport ? `$${dexReport.totalLiquidityUsd.toLocaleString()}` : "N/A"}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
                  <span className="text-slate-400 block">24h Volume</span>
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
                {wallet && ws?.passActive && status?.gate402ContractAddress && (
                  <button
                    type="button"
                    onClick={handleAnchorAudit}
                    disabled={busyAction === "anchor"}
                    className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-300 font-semibold text-xs px-3 py-1.5 cursor-pointer"
                  >
                    {busyAction === "anchor"
                      ? "Anchoring on BSC…"
                      : "Anchor Audit Digest On-Chain"}
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
          <h2 className="text-xl font-bold text-white">Recent On-Chain .ai Contract Audits</h2>
          <span className="text-xs text-slate-400">
            Cryptographically signed by verified Binance Agent IDs · Smart contracts only
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
                    Be the first .ai Pass holder
                  </td>
                  <td data-label="Score" className="text-slate-400">
                    —
                  </td>
                  <td data-label="Verdict" className="text-slate-400">
                    Run a scan above
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

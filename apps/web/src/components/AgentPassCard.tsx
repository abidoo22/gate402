"use client";

import { useRef } from "react";
import { CheckCircle2, Flame, ShieldCheck } from "lucide-react";

interface AgentPassCardProps {
  handle: string | null;
  passActive: boolean;
  passId: number;
  streakDays: number;
  checkedInToday: boolean;
  walletShort: string | null;
}

export function AgentPassCard({
  handle,
  passActive,
  passId,
  streakDays,
  checkedInToday,
  walletShort,
}: AgentPassCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateY = (x - 0.5) * 12;
    const rotateX = (0.5 - y) * 10;
    cardRef.current.style.setProperty("--px", `${Math.round(x * 100)}%`);
    cardRef.current.style.setProperty("--py", `${Math.round(y * 100)}%`);
    cardRef.current.style.setProperty("--rx", `${rotateX.toFixed(2)}deg`);
    cardRef.current.style.setProperty("--ry", `${rotateY.toFixed(2)}deg`);
  };

  const handlePointerLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.setProperty("--rx", "0deg");
    cardRef.current.style.setProperty("--ry", "0deg");
    cardRef.current.style.setProperty("--px", "75%");
    cardRef.current.style.setProperty("--py", "20%");
  };

  const displayHandle = handle ? `${handle}.ai` : "yourname.ai";
  const dailyLimit = passActive ? (checkedInToday ? 50 : 25) : 50;
  const formattedPass = passActive ? `#${String(passId).padStart(4, "0")}` : "PREVIEW";

  return (
    <div className="holo-stage">
      <div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="holo-card rounded-2xl border border-amber-400/25 p-5 overflow-hidden select-none"
      >
        {/* Dynamic pointer-reactive foil sheen */}
        <div aria-hidden="true" className="holo-sheen absolute inset-0 rounded-2xl" />

        {/* Subtle etched circuit filigree SVG */}
        <svg
          aria-hidden="true"
          viewBox="0 0 360 200"
          className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.14]"
        >
          <path
            d="M 0 38 H 95 L 122 65 H 245 M 360 154 H 260 L 235 129 H 130 M 280 0 V 52 L 310 82 H 360"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1"
          />
          <circle cx="245" cy="65" r="3" fill="#10b981" />
          <circle cx="130" cy="129" r="3" fill="#fbbf24" />
        </svg>

        <div className="relative z-10 flex flex-col gap-5">
          {/* Card Top Row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/25 to-emerald-500/20 border border-amber-300/40 text-amber-300">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-display text-xs font-bold tracking-wide text-slate-100">
                  GATE402 GUARD PASS
                </p>
                <p className="font-mono text-[10px] text-slate-400">
                  BSC CHAIN 56 · SOULBOUND
                </p>
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider border ${
                passActive
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40"
                  : "bg-amber-500/15 text-amber-300 border-amber-400/35"
              }`}
            >
              {passActive && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
              {formattedPass}
            </span>
          </div>

          {/* Engraved Metallic Handle */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                {passActive ? "Verified Agent ID" : "Specimen Agent ID"}
              </p>
              <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-amber-200 via-amber-400 to-emerald-300 bg-clip-text text-transparent">
                {displayHandle}
              </p>
            </div>

            {/* Engraved Smart-Card EMV-Style Chip */}
            <svg
              aria-hidden="true"
              width="38"
              height="28"
              viewBox="0 0 38 28"
              className="shrink-0 opacity-85"
            >
              <rect
                x="1"
                y="1"
                width="36"
                height="26"
                rx="5"
                fill="rgba(245, 158, 11, 0.14)"
                stroke="#f59e0b"
                strokeOpacity="0.55"
              />
              <path
                d="M1 10 H13 M25 10 H37 M1 18 H13 M25 18 H37 M13 1 V27 M25 1 V27"
                stroke="#fbbf24"
                strokeOpacity="0.45"
                strokeWidth="0.9"
              />
            </svg>
          </div>

          {/* Bottom Quota & Streak Bar */}
          <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
            <span className="text-emerald-300 font-semibold">
              {dailyLimit} FREE CALLS / DAY {checkedInToday || !passActive ? "· 2× BOOST" : ""}
            </span>
            <span className="inline-flex items-center gap-1 text-slate-300">
              {passActive ? (
                <>
                  <Flame className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                  {streakDays}d streak
                </>
              ) : walletShort ? (
                <span>{walletShort}</span>
              ) : (
                <span className="text-slate-400">0 BNB · Gas Only</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

interface SafetyGaugeProps {
  score: number;
  verdict: "SAFE" | "CAUTION" | "HIGH_RISK";
}

export function SafetyGauge({ score, verdict }: SafetyGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const palette =
    verdict === "SAFE"
      ? {
          strokeStart: "#10b981",
          strokeEnd: "#34d399",
          pill: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
          glow: "rgba(16, 185, 129, 0.28)",
          label: "SAFE",
        }
      : verdict === "CAUTION"
        ? {
            strokeStart: "#f59e0b",
            strokeEnd: "#fbbf24",
            pill: "bg-amber-500/15 text-amber-300 border-amber-400/40",
            glow: "rgba(245, 158, 11, 0.28)",
            label: "CAUTION",
          }
        : {
            strokeStart: "#f43f5e",
            strokeEnd: "#fb7185",
            pill: "bg-rose-500/15 text-rose-300 border-rose-400/40",
            glow: "rgba(244, 63, 94, 0.3)",
            label: "HIGH RISK",
          };

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0">
        <svg
          role="img"
          aria-label={`Safety score ${clamped} out of 100, verdict ${palette.label}`}
          viewBox="0 0 120 120"
          className="h-full w-full -rotate-90"
        >
          <defs>
            <linearGradient id={`gauge-${verdict}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={palette.strokeStart} />
              <stop offset="100%" stopColor={palette.strokeEnd} />
            </linearGradient>
          </defs>
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="rgba(148, 163, 184, 0.14)"
            strokeWidth="9"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={`url(#gauge-${verdict})`}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              filter: `drop-shadow(0 0 8px ${palette.glow})`,
              transition: "stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl sm:text-3xl font-extrabold text-white leading-none">
            {clamped}
          </span>
          <span className="font-mono text-[10px] text-slate-400 mt-0.5">/ 100</span>
        </div>
      </div>

      <div className="space-y-1.5 min-w-0">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold tracking-wider border ${palette.pill}`}
        >
          {palette.label}
        </span>
        <p className="text-xs text-slate-400 leading-snug text-pretty">
          GoPlus + BSC bytecode verdict
        </p>
      </div>
    </div>
  );
}

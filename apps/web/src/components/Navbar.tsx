"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, ShieldCheck, Terminal } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/75 bg-[#04070d]/85 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 min-h-14 sm:min-h-16 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-100 font-display font-bold tracking-tight text-base sm:text-lg"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400/25 via-emerald-500/10 to-amber-500/15 border border-emerald-400/40 text-emerald-300 shadow-sm shadow-emerald-500/20">
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </span>
            <span className="whitespace-nowrap">
              Gate<span className="text-emerald-400">402</span>
            </span>
          </Link>

          <a
            href="https://bscscan.com/address/0x08441938440B097ABd849FDB0F6CFe700AB6e994#code"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 anim-pulse" aria-hidden="true" />
            <span>BSC 56 · Verified</span>
            <ExternalLink className="h-3 w-3 opacity-80" aria-hidden="true" />
          </a>
        </div>

        <nav
          aria-label="Primary"
          className="inline-flex items-center rounded-xl border border-slate-800/90 bg-[#090f1c] p-1 gap-1 shrink-0"
        >
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
              pathname === "/"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/35 shadow-sm shadow-emerald-500/10"
                : "text-slate-400 hover:text-slate-100 border border-transparent"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden="true" />
            <span>Guard</span>
            <span className="hidden sm:inline">Pass &amp; Scanner</span>
          </Link>
          <Link
            href="/developers"
            aria-current={pathname === "/developers" ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
              pathname === "/developers"
                ? "bg-amber-500/15 text-amber-300 border border-amber-400/35 shadow-sm shadow-amber-500/10"
                : "text-slate-400 hover:text-slate-100 border border-transparent"
            }`}
          >
            <Terminal className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden="true" />
            <span>Devs</span>
            <span className="hidden sm:inline">&amp; x402</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

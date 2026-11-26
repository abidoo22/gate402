"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Terminal } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#050810]/90 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-100 font-bold tracking-tight text-base sm:text-lg shrink-0"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-400/35 text-emerald-400 shadow-sm shadow-emerald-500/10">
            <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          </span>
          <span className="whitespace-nowrap">
            Gate<span className="text-emerald-400">402</span>
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="inline-flex items-center rounded-xl border border-slate-800 bg-[#0b111d] p-1 gap-1 shrink-0"
        >
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
              pathname === "/"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-100"
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
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-100"
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

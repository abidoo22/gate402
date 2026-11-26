"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Terminal } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#060a11]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-slate-100 font-bold tracking-tight text-lg"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-400">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            Gate<span className="text-emerald-400">402</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={`btn-target inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "text-slate-300 hover:text-white hover:bg-slate-800/70"
            }`}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Guard Pass &amp; Scanner</span>
          </Link>
          <Link
            href="/developers"
            aria-current={pathname === "/developers" ? "page" : undefined}
            className={`btn-target inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/developers"
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                : "text-slate-300 hover:text-white hover:bg-slate-800/70"
            }`}
          >
            <Terminal className="h-4 w-4" aria-hidden="true" />
            <span>Developers &amp; x402</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

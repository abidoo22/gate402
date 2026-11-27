import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Gate402 | Sybil-Proof Agent ID Free-Tier & x402 API Gateway on BSC",
  description:
    "One verified Binance Agent ID (.ai) unlocks 25–50 Sybil-proof free daily BSC contract safety scans, DEX liquidity intel, and seamless Binance x402 v2 USDT overflow payments.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#04070d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="dark" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen flex flex-col relative selection:bg-emerald-500/30 selection:text-emerald-100">
        <a href="#main-content" className="skip-link visually-hidden">
          Skip to main content
        </a>

        {/* Subtle architectural grid & ambient glow behind page */}
        <div
          aria-hidden="true"
          className="bg-blueprint-backdrop pointer-events-none fixed inset-0 -z-10"
        />

        <Navbar />

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          {children}
        </main>

        <footer className="border-t border-slate-800/70 bg-[#04070d]/90 backdrop-blur-md mt-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row gap-6 md:items-center md:justify-between text-xs text-slate-400">
            <div className="space-y-1.5">
              <p className="font-display font-semibold text-sm text-slate-100 tracking-tight">
                Gate<span className="text-emerald-400">402</span>{" "}
                <span className="text-slate-500 font-normal">·</span>{" "}
                <span className="text-slate-300 font-sans font-medium">
                  Sybil-Proof Agent ID Free-Tier &amp; x402 v2 Protocol
                </span>
              </p>
              <p className="max-w-xl leading-relaxed">
                Independent MIT open-source infrastructure on BNB Smart Chain. Ownerless,
                non-custodial, smart-contract audits only. Not affiliated with or endorsed by Binance.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px]">
              <a
                href="https://bscscan.com/address/0x08441938440B097ABd849FDB0F6CFe700AB6e994#code"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
              >
                Gate402Registry
              </a>
              <a
                href="https://bscscan.com/address/0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-300 underline underline-offset-4"
              >
                HandleRegistry
              </a>
              <a href="/skill.md" className="hover:text-white underline underline-offset-4">
                /skill.md
              </a>
              <a href="/api/mcp" className="hover:text-white underline underline-offset-4">
                /api/mcp
              </a>
              <a href="/developers" className="hover:text-amber-300 underline underline-offset-4">
                /developers
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

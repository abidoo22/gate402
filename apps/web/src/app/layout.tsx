import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Gate402 | Sybil-Proof Agent ID Free-Tier & x402 API Gateway on BSC",
  description:
    "Claim a free 0-BNB Binance Agent ID (.ai) Guard Pass to unlock Sybil-proof daily BSC contract safety scans, DEX intelligence, and seamless Binance x402 v2 USDT overflow payments.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#060a11",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="dark" />
      </head>
      <body className="min-h-screen flex flex-col">
        <a href="#main-content" className="skip-link visually-hidden">
          Skip to main content
        </a>
        <Navbar />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-800/80 bg-[#080d16] mt-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between text-xs text-slate-400">
            <div>
              <p className="font-semibold text-slate-200">
                Gate402 — Open-Source Agent ID Free-Tier &amp; x402 v2 Protocol
              </p>
              <p className="mt-1">
                Independent MIT project built for the Agent ID Hackathon on BNB Smart Chain. Not affiliated with or endorsed by Binance.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <a
                href="https://bscscan.com/address/0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-emerald-400 underline underline-offset-4"
              >
                Agent ID HandleRegistry
              </a>
              <a href="/api/mcp" className="hover:text-emerald-400 underline underline-offset-4">
                MCP Endpoint
              </a>
              <a href="/developers" className="hover:text-emerald-400 underline underline-offset-4">
                Developers &amp; x402
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

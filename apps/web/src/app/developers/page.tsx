import type { Metadata } from "next";
import { DeveloperPortal } from "@/components/DeveloperPortal";

export const metadata: Metadata = {
  title: "Developers & x402 Gateway | Gate402",
  description:
    "Register your API on BNB Smart Chain with Sybil-proof .ai free quotas and Binance x402 v2 USDT overflow billing.",
};

export default function DevelopersPage() {
  return <DeveloperPortal />;
}

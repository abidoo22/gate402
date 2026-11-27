import { isAddress, type Address } from "viem";
import { AGENT_ID_REGISTRY_ADDRESS } from "@gate402/middleware";

export const DEFAULT_BSC_RPC_URL = "https://bsc-dataseed.binance.org/";
export const FALLBACK_BSC_RPC_URL = "https://bsc-rpc.publicnode.com";
export const SAMPLE_WBNB_ADDRESS: Address = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
export const DEFAULT_GATE402_CONTRACT_ADDRESS: Address =
  "0x08441938440B097ABd849FDB0F6CFe700AB6e994";

export const FLAGSHIP_SERVICES = [
  {
    slug: "bsc-safety-audit",
    name: "BSC Contract Safety Audit",
    path: "/api/v1/bsc/safety-audit",
    method: "GET" as const,
    freeCallsPerDay: 25,
    priceUsdtLabel: "0.01 USDT",
    priceUsdtWei: 10_000_000_000_000_000n,
    description:
      "Deterministic smart-contract security scan combining GoPlus BSC security signals, bytecode privilege heuristics, and Sourcify verification. Strictly blocks EOA wallet lookups.",
  },
  {
    slug: "bsc-dex-intel",
    name: "BSC DEX Liquidity Deep-Brief",
    path: "/api/v1/bsc/dex-intel",
    method: "GET" as const,
    freeCallsPerDay: 25,
    priceUsdtLabel: "0.01 USDT",
    priceUsdtWei: 10_000_000_000_000_000n,
    description:
      "Live PancakeSwap & BSC DEX pool depth, buy/sell pressure ratios, volume velocity, and FDV-to-liquidity danger scoring formatted for AI agents.",
  },
  {
    slug: "bsc-tx-preflight",
    name: "BSC Transaction Preflight Simulator",
    path: "/api/v1/bsc/tx-preflight",
    method: "POST" as const,
    freeCallsPerDay: 25,
    priceUsdtLabel: "0.01 USDT",
    priceUsdtWei: 10_000_000_000_000_000n,
    description:
      "Simulates raw BSC calldata via eth_call & eth_estimateGas, decodes 4-byte selectors, and flags unlimited ERC-20 approvals or reverts before signing.",
  },
] as const;

export function getServerConfig() {
  const rpcUrl = process.env.BSC_RPC_URL?.trim() || DEFAULT_BSC_RPC_URL;
  const agentIdRegistryAddress = (
    process.env.AGENT_ID_REGISTRY_ADDRESS?.trim() || AGENT_ID_REGISTRY_ADDRESS
  ) as Address;

  const rawContract =
    process.env.GATE402_CONTRACT_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_GATE402_CONTRACT_ADDRESS?.trim() ||
    DEFAULT_GATE402_CONTRACT_ADDRESS;
  const gate402ContractAddress = isAddress(rawContract) ? (rawContract as Address) : undefined;

  const rawPayTo = process.env.GATE402_PAY_TO_ADDRESS?.trim() || "";
  const payTo: Address = isAddress(rawPayTo)
    ? (rawPayTo as Address)
    : ("0x000000000000000000000000000000000000dEaD" as Address);

  const rawAppUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const appUrl = rawAppUrl.replace(/\/+$/, "");

  const facilitatorUrl = process.env.X402_FACILITATOR_URL?.trim() || undefined;

  return {
    rpcUrl,
    agentIdRegistryAddress,
    gate402ContractAddress,
    payTo,
    appUrl,
    facilitatorUrl,
  };
}

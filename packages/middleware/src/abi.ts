import { keccak256, toBytes, type Address } from "viem";

/** Official SPACE ID HandleRegistry for Binance Agent ID (.ai) on BNB Smart Chain Mainnet */
export const AGENT_ID_REGISTRY_ADDRESS: Address = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";

/** Canonical BSC Mainnet (eip155:56) payment tokens supported by Binance Agentic Wallet x402 v2 */
export const BSC_CHAIN_ID = 56 as const;
export const BSC_CAIP2 = "eip155:56" as const;
export const BSC_USDT_ADDRESS: Address = "0x55d398326f99059fF775485246999027B3197955";
export const BSC_USDC_ADDRESS: Address = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
export const BSC_PERMIT2_ADDRESS: Address = "0x000000000022D473030F116dDEE9F6B43aC7";

export function serviceSlugHash(slug: string): `0x${string}` {
  return keccak256(toBytes(slug));
}

export const AGENT_ID_REGISTRY_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "handleOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "ownerOfHandle",
    stateMutability: "view",
    inputs: [{ name: "handle", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const GATE402_REGISTRY_ABI = [
  {
    type: "function",
    name: "REGISTRY",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "activatePass",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [
      { name: "passId", type: "uint64" },
      { name: "handle", type: "string" },
    ],
  },
  {
    type: "function",
    name: "refreshDailyPass",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "newStreak", type: "uint32" }],
  },
  {
    type: "function",
    name: "registerService",
    stateMutability: "nonpayable",
    inputs: [
      { name: "slug", type: "bytes32" },
      { name: "name", type: "string" },
      { name: "endpointUrl", type: "string" },
      { name: "freeCallsPerDay", type: "uint16" },
      { name: "priceUsdtWei", type: "uint96" },
      { name: "payTo", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateService",
    stateMutability: "nonpayable",
    inputs: [
      { name: "slug", type: "bytes32" },
      { name: "endpointUrl", type: "string" },
      { name: "freeCallsPerDay", type: "uint16" },
      { name: "priceUsdtWei", type: "uint96" },
      { name: "payTo", type: "address" },
      { name: "active", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "recordAuditDigest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targetContract", type: "address" },
      { name: "safetyScore", type: "uint8" },
      { name: "verdict", type: "uint8" },
      { name: "reportHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "verifyAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      { name: "valid", type: "bool" },
      { name: "handle", type: "string" },
    ],
  },
  {
    type: "function",
    name: "hasActivePass",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      { name: "active", type: "bool" },
      { name: "handle", type: "string" },
      { name: "passId", type: "uint64" },
      { name: "streakDays", type: "uint32" },
      { name: "lastCheckInDay", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "getEffectiveDailyQuota",
    stateMutability: "view",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "slug", type: "bytes32" },
    ],
    outputs: [
      { name: "eligible", type: "bool" },
      { name: "dailyLimit", type: "uint256" },
      { name: "handle", type: "string" },
    ],
  },
  {
    type: "function",
    name: "getServices",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        name: "list",
        type: "tuple[]",
        components: [
          { name: "slug", type: "bytes32" },
          { name: "provider", type: "address" },
          { name: "providerHandle", type: "string" },
          { name: "name", type: "string" },
          { name: "endpointUrl", type: "string" },
          { name: "freeCallsPerDay", type: "uint16" },
          { name: "priceUsdtWei", type: "uint96" },
          { name: "payTo", type: "address" },
          { name: "active", type: "bool" },
          { name: "registeredAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getRecentAudits",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        name: "list",
        type: "tuple[]",
        components: [
          { name: "targetContract", type: "address" },
          { name: "auditor", type: "address" },
          { name: "auditorHandle", type: "string" },
          { name: "safetyScore", type: "uint8" },
          { name: "verdict", type: "uint8" },
          { name: "reportHash", type: "bytes32" },
          { name: "timestamp", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getStats",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "passes", type: "uint64" },
      { name: "services", type: "uint64" },
      { name: "audits", type: "uint64" },
      { name: "checkIns", type: "uint64" },
    ],
  },
] as const;

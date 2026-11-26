import {
  createPublicClient,
  http,
  isAddress,
  verifyMessage,
  type Address,
  type PublicClient,
} from "viem";
import { bsc } from "viem/chains";
import {
  AGENT_ID_REGISTRY_ABI,
  AGENT_ID_REGISTRY_ADDRESS,
  GATE402_REGISTRY_ABI,
  serviceSlugHash,
} from "./abi.js";
import { createDefaultQuotaStore, type QuotaStore } from "./quota.js";
import {
  buildX402Challenge,
  verifyX402PaymentSignature,
  type X402Challenge,
} from "./x402.js";

export * from "./abi.js";
export * from "./quota.js";
export * from "./x402.js";

export interface Gate402Config {
  /** Service identifier (e.g. "bsc-safety-audit") */
  serviceSlug: string;
  /** Human-readable description shown inside x402 PAYMENT-REQUIRED */
  description?: string;
  /** Default daily free calls per verified .ai handle if service is not yet seeded on-chain */
  defaultFreeCallsPerDay?: number;
  /** Overflow x402 price in BSC USDT wei (18 decimals; e.g. 10^16 = 0.01 USDT) */
  priceUsdtWei: bigint;
  /** BSC wallet receiving x402 paid overflow */
  payTo: Address;
  /** Deployed Gate402Registry address on BSC Mainnet (optional during pre-deploy testing) */
  gate402ContractAddress?: Address;
  /** Override Agent ID HandleRegistry address (defaults to official 0x60B9...022F) */
  agentIdRegistryAddress?: Address;
  /** BSC RPC URL (defaults to official public dataseed) */
  rpcUrl?: string;
  /** Optional custom viem PublicClient (useful for unit tests) */
  publicClient?: PublicClient;
  /** Quota store (defaults to Upstash if configured, else free in-memory store) */
  quotaStore?: QuotaStore;
  /** Optional live x402 facilitator base URL */
  facilitatorUrl?: string;
  /** Signature timestamp freshness window in seconds (default 300s = 5 min) */
  maxSignatureAgeSeconds?: number;
}

export interface Gate402Decision {
  allowed: boolean;
  status: 200 | 401 | 402;
  mode?: "agent-id-free" | "x402-paid";
  reason?: string;
  handle?: string;
  wallet?: Address;
  quotaUsed?: number;
  quotaLimit?: number;
  quotaRemaining?: number;
  x402Challenge?: X402Challenge;
  headers: Record<string, string>;
}

export function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Deterministic human-readable EIP-191 auth payload signed by a browser wallet or `baw sign-message`.
 * Does NOT request private keys, session storage, or web QR pairing (compliant with Binance Red Line #1).
 */
export function buildGate402AuthMessage(params: {
  serviceSlug: string;
  address: Address;
  timestamp: number;
  dateUtc?: string;
}): string {
  const dateUtc = params.dateUtc ?? getUtcDateString(new Date(params.timestamp * 1000));
  return [
    "Gate402 Agent ID Access",
    `Service: ${params.serviceSlug}`,
    `Wallet: ${params.address.toLowerCase()}`,
    `DateUTC: ${dateUtc}`,
    `Timestamp: ${params.timestamp}`,
  ].join("\n");
}

/**
 * Queries BSC Mainnet for a wallet's Agent ID & Gate402 Pass eligibility.
 */
export async function resolveAgentQuotaOnChain(params: {
  client: PublicClient;
  wallet: Address;
  serviceSlug: string;
  defaultFreeCallsPerDay: number;
  gate402ContractAddress?: Address;
  agentIdRegistryAddress: Address;
}): Promise<{
  eligible: boolean;
  hasAgentId: boolean;
  hasPass: boolean;
  handle: string;
  dailyLimit: number;
}> {
  const { client, wallet, serviceSlug, defaultFreeCallsPerDay, gate402ContractAddress, agentIdRegistryAddress } = params;

  if (gate402ContractAddress) {
    try {
      const [eligible, dailyLimit, handle] = await client.readContract({
        address: gate402ContractAddress,
        abi: GATE402_REGISTRY_ABI,
        functionName: "getEffectiveDailyQuota",
        args: [wallet, serviceSlugHash(serviceSlug)],
      });
      if (eligible && handle.length > 0 && dailyLimit > 0n) {
        return {
          eligible: true,
          hasAgentId: true,
          hasPass: true,
          handle,
          dailyLimit: Number(dailyLimit),
        };
      }

      // Fallback if service slug isn't seeded yet on-chain, but user DOES hold an active Gate402 Pass
      const [active, passHandle, , , lastCheckInDay] = await client.readContract({
        address: gate402ContractAddress,
        abi: GATE402_REGISTRY_ABI,
        functionName: "hasActivePass",
        args: [wallet],
      });
      if (active && passHandle.length > 0) {
        const today = BigInt(Math.floor(Date.now() / 86_400_000));
        const multiplier = lastCheckInDay === today ? 2 : 1;
        return {
          eligible: true,
          hasAgentId: true,
          hasPass: true,
          handle: passHandle,
          dailyLimit: defaultFreeCallsPerDay * multiplier,
        };
      }
    } catch {
      // Fall through to direct HandleRegistry check below to report accurate Agent ID status
    }
  }

  // Direct 3-read verification against SPACE ID HandleRegistry (0x60B9...022F)
  try {
    const balance = await client.readContract({
      address: agentIdRegistryAddress,
      abi: AGENT_ID_REGISTRY_ABI,
      functionName: "balanceOf",
      args: [wallet],
    });
    if (balance === 0n) {
      return { eligible: false, hasAgentId: false, hasPass: false, handle: "", dailyLimit: 0 };
    }

    const handle = await client.readContract({
      address: agentIdRegistryAddress,
      abi: AGENT_ID_REGISTRY_ABI,
      functionName: "handleOf",
      args: [wallet],
    });
    if (!handle) {
      return { eligible: false, hasAgentId: false, hasPass: false, handle: "", dailyLimit: 0 };
    }

    const owner = await client.readContract({
      address: agentIdRegistryAddress,
      abi: AGENT_ID_REGISTRY_ABI,
      functionName: "ownerOfHandle",
      args: [handle],
    });
    if (owner.toLowerCase() !== wallet.toLowerCase()) {
      return { eligible: false, hasAgentId: false, hasPass: false, handle: "", dailyLimit: 0 };
    }

    // If Gate402 contract is deployed, user must activate their free 0-BNB Pass first;
    // if not yet configured (pre-deploy dev mode), direct .ai holders receive default quota.
    const passRequired = Boolean(gate402ContractAddress);
    return {
      eligible: !passRequired,
      hasAgentId: true,
      hasPass: false,
      handle,
      dailyLimit: passRequired ? 0 : defaultFreeCallsPerDay,
    };
  } catch {
    return { eligible: false, hasAgentId: false, hasPass: false, handle: "", dailyLimit: 0 };
  }
}

/**
 * Core Gate402 request gatekeeper:
 * 1. Checks `PAYMENT-SIGNATURE` header for native Binance `x402` v2 paid execution.
 * 2. Otherwise validates EIP-191 signature + live BSC Agent ID / Gate402 Pass + Sybil-proof daily quota.
 * 3. On missing credentials or quota exhaustion, responds with HTTP 402 + `PAYMENT-REQUIRED` header.
 */
export async function evaluateGate402Request(
  request: Request,
  config: Gate402Config
): Promise<Gate402Decision> {
  const resourceUrl = request.url;
  const challenge = buildX402Challenge({
    resourceUrl,
    description: config.description ?? `Gate402 API access (${config.serviceSlug})`,
    payTo: config.payTo,
    amountUsdtWei: config.priceUsdtWei,
  });

  // 1. Check x402 v2 payment replay header first
  const x402Sig =
    request.headers.get("payment-signature") ?? request.headers.get("x-payment") ?? "";
  if (x402Sig) {
    const paymentResult = await verifyX402PaymentSignature({
      headerValue: x402Sig,
      expectedPayTo: config.payTo,
      minAmountWei: config.priceUsdtWei,
      facilitatorUrl: config.facilitatorUrl,
    });

    if (!paymentResult.valid) {
      return {
        allowed: false,
        status: 402,
        reason: paymentResult.reason ?? "INVALID_X402_PAYMENT",
        x402Challenge: challenge,
        headers: {
          [challenge.headerName]: challenge.headerValue,
          "X-Gate402-Mode": "x402-required",
        },
      };
    }

    const headers: Record<string, string> = {
      "X-Gate402-Mode": "x402-paid",
      "X-Gate402-Settlement": paymentResult.mode ?? "signature-verified",
    };
    if (paymentResult.paymentResponseHeader) {
      headers["PAYMENT-RESPONSE"] = paymentResult.paymentResponseHeader;
    }
    return {
      allowed: true,
      status: 200,
      mode: "x402-paid",
      headers,
    };
  }

  // 2. Check Sybil-proof Agent ID free-tier authentication headers
  const addressHeader = request.headers.get("x-agent-address")?.trim() ?? "";
  const timestampHeader = request.headers.get("x-agent-timestamp")?.trim() ?? "";
  const signatureHeader = request.headers.get("x-agent-signature")?.trim() ?? "";

  if (!addressHeader || !timestampHeader || !signatureHeader) {
    return {
      allowed: false,
      status: 402,
      reason: "AGENT_ID_OR_X402_REQUIRED",
      x402Challenge: challenge,
      headers: {
        [challenge.headerName]: challenge.headerValue,
        "X-Gate402-Mode": "payment-or-agent-id-required",
      },
    };
  }

  if (!isAddress(addressHeader)) {
    return {
      allowed: false,
      status: 401,
      reason: "INVALID_WALLET_ADDRESS",
      headers: { "X-Gate402-Error": "INVALID_WALLET_ADDRESS" },
    };
  }

  const ts = Number(timestampHeader);
  const maxAge = config.maxSignatureAgeSeconds ?? 300;
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > maxAge) {
    return {
      allowed: false,
      status: 401,
      reason: "EXPIRED_AUTH_TIMESTAMP",
      headers: { "X-Gate402-Error": "EXPIRED_AUTH_TIMESTAMP" },
    };
  }

  const wallet = addressHeader as Address;
  const expectedMessage = buildGate402AuthMessage({
    serviceSlug: config.serviceSlug,
    address: wallet,
    timestamp: ts,
  });

  let sigValid = false;
  try {
    sigValid = await verifyMessage({
      address: wallet,
      message: expectedMessage,
      signature: signatureHeader as `0x${string}`,
    });
  } catch {
    sigValid = false;
  }

  if (!sigValid) {
    return {
      allowed: false,
      status: 401,
      reason: "INVALID_AGENT_SIGNATURE",
      headers: { "X-Gate402-Error": "INVALID_AGENT_SIGNATURE" },
    };
  }

  const client =
    config.publicClient ??
    createPublicClient({
      chain: bsc,
      transport: http(config.rpcUrl ?? "https://bsc-dataseed.binance.org/"),
    });

  const onChain = await resolveAgentQuotaOnChain({
    client,
    wallet,
    serviceSlug: config.serviceSlug,
    defaultFreeCallsPerDay: config.defaultFreeCallsPerDay ?? 25,
    gate402ContractAddress: config.gate402ContractAddress,
    agentIdRegistryAddress: config.agentIdRegistryAddress ?? AGENT_ID_REGISTRY_ADDRESS,
  });

  if (!onChain.hasAgentId) {
    return {
      allowed: false,
      status: 402,
      reason: "NO_BINANCE_AGENT_ID",
      wallet,
      x402Challenge: challenge,
      headers: {
        [challenge.headerName]: challenge.headerValue,
        "X-Gate402-Mode": "no-agent-id",
      },
    };
  }

  if (!onChain.eligible) {
    return {
      allowed: false,
      status: 402,
      reason: "GATE402_PASS_NOT_ACTIVATED",
      wallet,
      handle: onChain.handle,
      x402Challenge: challenge,
      headers: {
        [challenge.headerName]: challenge.headerValue,
        "X-Gate402-Handle": `${onChain.handle}.ai`,
        "X-Gate402-Mode": "pass-activation-required",
      },
    };
  }

  const quotaStore = config.quotaStore ?? createDefaultQuotaStore();
  const dateUtc = getUtcDateString();
  const quotaKey = `gate402:${config.serviceSlug}:${onChain.handle.toLowerCase()}:${dateUtc}`;
  const currentUsed = await quotaStore.getCount(quotaKey);

  if (currentUsed >= onChain.dailyLimit) {
    return {
      allowed: false,
      status: 402,
      reason: "DAILY_FREE_QUOTA_EXCEEDED",
      wallet,
      handle: onChain.handle,
      quotaUsed: currentUsed,
      quotaLimit: onChain.dailyLimit,
      quotaRemaining: 0,
      x402Challenge: challenge,
      headers: {
        [challenge.headerName]: challenge.headerValue,
        "X-Gate402-Mode": "x402-overflow-required",
        "X-Gate402-Handle": `${onChain.handle}.ai`,
        "X-Gate402-Quota-Limit": String(onChain.dailyLimit),
        "X-Gate402-Quota-Remaining": "0",
      },
    };
  }

  const newUsed = await quotaStore.increment(quotaKey, 86_400);
  const remaining = Math.max(0, onChain.dailyLimit - newUsed);

  return {
    allowed: true,
    status: 200,
    mode: "agent-id-free",
    wallet,
    handle: onChain.handle,
    quotaUsed: newUsed,
    quotaLimit: onChain.dailyLimit,
    quotaRemaining: remaining,
    headers: {
      "X-Gate402-Mode": "agent-id-free",
      "X-Gate402-Handle": `${onChain.handle}.ai`,
      "X-Gate402-Quota-Limit": String(onChain.dailyLimit),
      "X-Gate402-Quota-Remaining": String(remaining),
    },
  };
}

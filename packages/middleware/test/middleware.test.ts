import { describe, expect, it, beforeEach } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, PublicClient } from "viem";
import {
  BSC_CAIP2,
  BSC_USDT_ADDRESS,
  MemoryQuotaStore,
  buildGate402AuthMessage,
  evaluateGate402Request,
  resetX402NonceCache,
} from "../src/index.js";

const TEST_ACCOUNT = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);
const PAY_TO: Address = "0x1111111111111111111111111111111111111111";
const MOCK_CONTRACT: Address = "0x2222222222222222222222222222222222222222";

function createMockClient(options: {
  eligible: boolean;
  dailyLimit: bigint;
  handle: string;
  hasAgentId?: boolean;
}): PublicClient {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "getEffectiveDailyQuota") {
        return [options.eligible, options.dailyLimit, options.handle] as const;
      }
      if (functionName === "hasActivePass") {
        return [options.eligible, options.handle, 1n, 1, 0n] as const;
      }
      if (functionName === "balanceOf") {
        return options.hasAgentId ? 1n : 0n;
      }
      if (functionName === "handleOf") {
        return options.hasAgentId ? options.handle : "";
      }
      if (functionName === "ownerOfHandle") {
        return options.hasAgentId ? TEST_ACCOUNT.address : "0x0000000000000000000000000000000000000000";
      }
      throw new Error(`Unexpected readContract: ${functionName}`);
    },
  } as unknown as PublicClient;
}

describe("@gate402/middleware", () => {
  const quotaStore = new MemoryQuotaStore();

  beforeEach(() => {
    quotaStore.clear();
    resetX402NonceCache();
  });

  it("returns HTTP 402 with valid x402 v2 PAYMENT-REQUIRED header for unauthenticated callers", async () => {
    const req = new Request("https://gate402.vercel.app/api/v1/bsc/safety-audit?address=0x123");
    const decision = await evaluateGate402Request(req, {
      serviceSlug: "bsc-safety-audit",
      priceUsdtWei: 10_000_000_000_000_000n, // 0.01 USDT
      payTo: PAY_TO,
      gate402ContractAddress: MOCK_CONTRACT,
      quotaStore,
      publicClient: createMockClient({ eligible: false, dailyLimit: 0n, handle: "" }),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(402);
    expect(decision.headers["PAYMENT-REQUIRED"]).toBeTruthy();

    const decoded = JSON.parse(
      Buffer.from(decision.headers["PAYMENT-REQUIRED"], "base64").toString("utf-8")
    );
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepts[0].network).toBe(BSC_CAIP2);
    expect(decoded.accepts[0].asset).toBe(BSC_USDT_ADDRESS);
    expect(decoded.accepts[0].payTo).toBe(PAY_TO);
  });

  it("grants free daily quota per .ai handle and seamlessly triggers x402 on overflow", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const msg = buildGate402AuthMessage({
      serviceSlug: "bsc-safety-audit",
      address: TEST_ACCOUNT.address,
      timestamp: ts,
    });
    const sig = await TEST_ACCOUNT.signMessage({ message: msg });

    const makeReq = () =>
      new Request("https://gate402.vercel.app/api/v1/bsc/safety-audit", {
        headers: {
          "x-agent-address": TEST_ACCOUNT.address,
          "x-agent-timestamp": String(ts),
          "x-agent-signature": sig,
        },
      });

    const cfg = {
      serviceSlug: "bsc-safety-audit",
      priceUsdtWei: 10_000_000_000_000_000n,
      payTo: PAY_TO,
      gate402ContractAddress: MOCK_CONTRACT,
      quotaStore,
      publicClient: createMockClient({ eligible: true, dailyLimit: 2n, handle: "abido" }),
    };

    const call1 = await evaluateGate402Request(makeReq(), cfg);
    expect(call1.allowed).toBe(true);
    expect(call1.mode).toBe("agent-id-free");
    expect(call1.handle).toBe("abido");
    expect(call1.quotaRemaining).toBe(1);

    const call2 = await evaluateGate402Request(makeReq(), cfg);
    expect(call2.allowed).toBe(true);
    expect(call2.quotaRemaining).toBe(0);

    // Call 3 exceeds daily free quota -> HTTP 402 overflow with x402 v2 challenge!
    const call3 = await evaluateGate402Request(makeReq(), cfg);
    expect(call3.allowed).toBe(false);
    expect(call3.status).toBe(402);
    expect(call3.reason).toBe("DAILY_FREE_QUOTA_EXCEEDED");
    expect(call3.headers["PAYMENT-REQUIRED"]).toBeTruthy();
  });

  it("accepts a valid x402 PAYMENT-SIGNATURE replay and blocks replay reuse", async () => {
    const paymentPayload = {
      x402Version: 2,
      network: BSC_CAIP2,
      accepted: { payTo: PAY_TO },
      payload: {
        signature: "0x" + "ab".repeat(65),
        permit2Authorization: {
          permitted: {
            token: BSC_USDT_ADDRESS,
            amount: "10000000000000000",
          },
          nonce: "0x123456",
          deadline: Math.floor(Date.now() / 1000) + 600,
        },
      },
    };
    const encoded = Buffer.from(JSON.stringify(paymentPayload), "utf-8").toString("base64");

    const cfg = {
      serviceSlug: "bsc-safety-audit",
      priceUsdtWei: 10_000_000_000_000_000n,
      payTo: PAY_TO,
      gate402ContractAddress: MOCK_CONTRACT,
      quotaStore,
      publicClient: createMockClient({ eligible: false, dailyLimit: 0n, handle: "" }),
    };

    const first = await evaluateGate402Request(
      new Request("https://gate402.vercel.app/api/v1/bsc/safety-audit", {
        headers: { "PAYMENT-SIGNATURE": encoded },
      }),
      cfg
    );
    expect(first.allowed).toBe(true);
    expect(first.mode).toBe("x402-paid");
    expect(first.headers["PAYMENT-RESPONSE"]).toBeTruthy();

    // Replay of same nonce is rejected
    const replay = await evaluateGate402Request(
      new Request("https://gate402.vercel.app/api/v1/bsc/safety-audit", {
        headers: { "PAYMENT-SIGNATURE": encoded },
      }),
      cfg
    );
    expect(replay.allowed).toBe(false);
    expect(replay.status).toBe(402);
    expect(replay.reason).toBe("PAYMENT_REPLAY_DETECTED");
  });
});

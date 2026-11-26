import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import {
  AGENT_ID_REGISTRY_ABI,
  GATE402_REGISTRY_ABI,
  buildX402Challenge,
} from "@gate402/middleware";
import { FLAGSHIP_SERVICES, getServerConfig } from "@/lib/config";
import { createBscClient } from "@/lib/bsc-intel";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const walletParam = url.searchParams.get("wallet")?.trim() ?? "";
  const cfg = getServerConfig();
  const client = createBscClient(cfg.rpcUrl);

  let stats: { passes: number; services: number; audits: number; checkIns: number } = {
    passes: 0,
    services: FLAGSHIP_SERVICES.length,
    audits: 0,
    checkIns: 0,
  };
  let onChainServices: Array<{
    slug: string;
    name: string;
    providerHandle: string;
    endpointUrl: string;
    freeCallsPerDay: number;
    priceUsdtWei: string;
    payTo: string;
    active: boolean;
  }> = [];
  let recentAudits: Array<{
    targetContract: string;
    auditorHandle: string;
    safetyScore: number;
    verdict: number;
    reportHash: string;
    timestamp: number;
  }> = [];

  if (cfg.gate402ContractAddress) {
    try {
      const [rawStats, rawServices, rawAudits] = await Promise.all([
        client.readContract({
          address: cfg.gate402ContractAddress,
          abi: GATE402_REGISTRY_ABI,
          functionName: "getStats",
        }),
        client.readContract({
          address: cfg.gate402ContractAddress,
          abi: GATE402_REGISTRY_ABI,
          functionName: "getServices",
          args: [0n, 20n],
        }),
        client.readContract({
          address: cfg.gate402ContractAddress,
          abi: GATE402_REGISTRY_ABI,
          functionName: "getRecentAudits",
          args: [0n, 15n],
        }),
      ]);

      stats = {
        passes: Number(rawStats[0]),
        services: Number(rawStats[1]) || FLAGSHIP_SERVICES.length,
        audits: Number(rawStats[2]),
        checkIns: Number(rawStats[3]),
      };

      onChainServices = rawServices.map((s) => ({
        slug: s.slug,
        name: s.name,
        providerHandle: s.providerHandle,
        endpointUrl: s.endpointUrl,
        freeCallsPerDay: Number(s.freeCallsPerDay),
        priceUsdtWei: s.priceUsdtWei.toString(),
        payTo: s.payTo,
        active: s.active,
      }));

      recentAudits = rawAudits.map((a) => ({
        targetContract: a.targetContract,
        auditorHandle: a.auditorHandle,
        safetyScore: Number(a.safetyScore),
        verdict: Number(a.verdict),
        reportHash: a.reportHash,
        timestamp: Number(a.timestamp),
      }));
    } catch {
      // Keep graceful defaults if RPC times out
    }
  }

  let walletStatus: {
    wallet: Address;
    hasAgentId: boolean;
    handle: string | null;
    passActive: boolean;
    passId: number;
    streakDays: number;
    checkedInToday: boolean;
  } | null = null;

  if (walletParam && isAddress(walletParam)) {
    const wallet = walletParam as Address;
    try {
      const bal = await client.readContract({
        address: cfg.agentIdRegistryAddress,
        abi: AGENT_ID_REGISTRY_ABI,
        functionName: "balanceOf",
        args: [wallet],
      });
      let handle: string | null = null;
      let hasAgentId = false;
      if (bal > 0n) {
        const h = await client.readContract({
          address: cfg.agentIdRegistryAddress,
          abi: AGENT_ID_REGISTRY_ABI,
          functionName: "handleOf",
          args: [wallet],
        });
        if (h) {
          const owner = await client.readContract({
            address: cfg.agentIdRegistryAddress,
            abi: AGENT_ID_REGISTRY_ABI,
            functionName: "ownerOfHandle",
            args: [h],
          });
          if (owner.toLowerCase() === wallet.toLowerCase()) {
            hasAgentId = true;
            handle = h;
          }
        }
      }

      let passActive = false;
      let passId = 0;
      let streakDays = 0;
      let checkedInToday = false;

      if (cfg.gate402ContractAddress && hasAgentId) {
        const [active, , id, streak, lastDay] = await client.readContract({
          address: cfg.gate402ContractAddress,
          abi: GATE402_REGISTRY_ABI,
          functionName: "hasActivePass",
          args: [wallet],
        });
        const today = BigInt(Math.floor(Date.now() / 86_400_000));
        passActive = active;
        passId = Number(id);
        streakDays = Number(streak);
        checkedInToday = active && lastDay === today;
      }

      walletStatus = {
        wallet,
        hasAgentId,
        handle,
        passActive,
        passId,
        streakDays,
        checkedInToday,
      };
    } catch {
      walletStatus = {
        wallet,
        hasAgentId: false,
        handle: null,
        passActive: false,
        passId: 0,
        streakDays: 0,
        checkedInToday: false,
      };
    }
  }

  const sampleX402 = buildX402Challenge({
    resourceUrl: `${cfg.appUrl}/api/v1/bsc/safety-audit`,
    description: FLAGSHIP_SERVICES[0].description,
    payTo: cfg.payTo,
    amountUsdtWei: FLAGSHIP_SERVICES[0].priceUsdtWei,
  });

  return NextResponse.json({
    ok: true,
    chainId: 56,
    agentIdRegistryAddress: cfg.agentIdRegistryAddress,
    gate402ContractAddress: cfg.gate402ContractAddress ?? null,
    stats,
    flagshipServices: FLAGSHIP_SERVICES.map((s) => ({
      slug: s.slug,
      name: s.name,
      endpointUrl: `${cfg.appUrl}${s.path}`,
      method: s.method,
      freeCallsPerDay: s.freeCallsPerDay,
      priceUsdtLabel: s.priceUsdtLabel,
      priceUsdtWei: s.priceUsdtWei.toString(),
      description: s.description,
    })),
    onChainServices,
    recentAudits,
    walletStatus,
    sampleX402,
  });
}

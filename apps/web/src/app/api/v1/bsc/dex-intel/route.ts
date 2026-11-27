import { NextResponse } from "next/server";
import { evaluateGate402Request } from "@gate402/middleware";
import { FLAGSHIP_SERVICES, getServerConfig, isSamplePreviewAddress } from "@/lib/config";
import { runBscDexIntel } from "@/lib/bsc-intel";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() ?? "";
  const isCanonicalSample =
    url.searchParams.get("preview") === "sample" && isSamplePreviewAddress(address);

  const cfg = getServerConfig();
  const svc = FLAGSHIP_SERVICES[1];

  let gateHeaders: Record<string, string> = {};
  let accessMeta: Record<string, unknown> = { mode: "sample-preview" };

  if (!isCanonicalSample) {
    const decision = await evaluateGate402Request(request, {
      serviceSlug: svc.slug,
      description: svc.description,
      defaultFreeCallsPerDay: svc.freeCallsPerDay,
      priceUsdtWei: svc.priceUsdtWei,
      payTo: cfg.payTo,
      gate402ContractAddress: cfg.gate402ContractAddress,
      agentIdRegistryAddress: cfg.agentIdRegistryAddress,
      rpcUrl: cfg.rpcUrl,
      facilitatorUrl: cfg.facilitatorUrl,
    });

    if (!decision.allowed) {
      return NextResponse.json(
        {
          error: decision.reason ?? "ACCESS_DENIED",
          message:
            "Authenticate with an active Binance Agent ID (.ai) Guard Pass for free daily quota or replay with x402 PAYMENT-SIGNATURE.",
          x402: decision.x402Challenge?.payload ?? null,
        },
        { status: decision.status, headers: decision.headers }
      );
    }

    gateHeaders = decision.headers;
    accessMeta = {
      mode: decision.mode,
      handle: decision.handle ? `${decision.handle}.ai` : null,
      quotaUsed: decision.quotaUsed ?? null,
      quotaLimit: decision.quotaLimit ?? null,
      quotaRemaining: decision.quotaRemaining ?? null,
    };
  }

  try {
    const report = await runBscDexIntel(address, cfg.rpcUrl);
    return NextResponse.json({ ok: true, access: accessMeta, report }, { headers: gateHeaders });
  } catch (err) {
    const code = err instanceof Error ? err.message : "DEX_INTEL_FAILED";
    const status = code === "INVALID_ADDRESS" || code === "EOA_NOT_ALLOWED" ? 400 : 502;
    return NextResponse.json(
      {
        error: code,
        message:
          code === "EOA_NOT_ALLOWED"
            ? "Target address must be a deployed BSC token contract."
            : "Provide a valid BSC token contract address.",
      },
      { status, headers: gateHeaders }
    );
  }
}

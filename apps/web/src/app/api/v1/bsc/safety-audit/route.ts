import { NextResponse } from "next/server";
import { evaluateGate402Request } from "@gate402/middleware";
import { FLAGSHIP_SERVICES, SAMPLE_WBNB_ADDRESS, getServerConfig } from "@/lib/config";
import { runBscSafetyAudit } from "@/lib/bsc-intel";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() ?? "";
  const isCanonicalSample =
    url.searchParams.get("preview") === "sample" &&
    address.toLowerCase() === SAMPLE_WBNB_ADDRESS.toLowerCase();

  const cfg = getServerConfig();
  const svc = FLAGSHIP_SERVICES[0];

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
            decision.reason === "GATE402_PASS_NOT_ACTIVATED"
              ? `Agent ID ${decision.handle}.ai detected — activate your free 0-BNB Gate402 Pass once on BSC to unlock 25–50 free calls/day, or pay via x402.`
              : decision.reason === "DAILY_FREE_QUOTA_EXCEEDED"
                ? `Daily free quota exhausted for ${decision.handle}.ai. Continue seamlessly using the x402 v2 PAYMENT-REQUIRED header (0.01 USDT on BSC).`
                : "Sign with a Binance Agent ID (.ai) Guard Pass for 25–50 free daily calls, or pay 0.01 USDT via x402 v2 (PAYMENT-REQUIRED header).",
          howToAccess: {
            freeAgentIdPass: `${cfg.appUrl}/`,
            x402Command: `baw x402-payment preview --paymentRequirements '<PAYMENT-REQUIRED header>' --json`,
          },
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
    const report = await runBscSafetyAudit(address, cfg.rpcUrl);
    return NextResponse.json({ ok: true, access: accessMeta, report }, { headers: gateHeaders });
  } catch (err) {
    const code = err instanceof Error ? err.message : "AUDIT_FAILED";
    if (code === "EOA_NOT_ALLOWED") {
      return NextResponse.json(
        {
          error: "EOA_NOT_ALLOWED",
          message:
            "Gate402 audits deployed BSC smart contracts only. Personal wallet addresses (EOAs) are blocked by design.",
        },
        { status: 400, headers: gateHeaders }
      );
    }
    if (code === "INVALID_ADDRESS") {
      return NextResponse.json(
        { error: "INVALID_ADDRESS", message: "Provide a valid 0x BSC smart contract address." },
        { status: 400, headers: gateHeaders }
      );
    }
    return NextResponse.json(
      { error: "AUDIT_FAILED", message: "Could not complete BSC safety scan. Retry shortly." },
      { status: 502, headers: gateHeaders }
    );
  }
}

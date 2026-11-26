import { NextResponse } from "next/server";
import { evaluateGate402Request } from "@gate402/middleware";
import { FLAGSHIP_SERVICES, getServerConfig } from "@/lib/config";
import { runBscTxPreflight } from "@/lib/bsc-intel";

export async function POST(request: Request) {
  const cfg = getServerConfig();
  const svc = FLAGSHIP_SERVICES[2];

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
          "Authenticate with an active Binance Agent ID (.ai) Guard Pass for free daily preflight checks or pay 0.01 USDT via x402 v2.",
        x402: decision.x402Challenge?.payload ?? null,
      },
      { status: decision.status, headers: decision.headers }
    );
  }

  let body: { from?: string; to?: string; value?: string; data?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Body must be JSON with from, to, value?, data?." },
      { status: 400, headers: decision.headers }
    );
  }

  try {
    const report = await runBscTxPreflight(
      {
        from: body.from ?? "",
        to: body.to ?? "",
        value: body.value,
        data: body.data,
      },
      cfg.rpcUrl
    );
    return NextResponse.json(
      {
        ok: true,
        access: {
          mode: decision.mode,
          handle: decision.handle ? `${decision.handle}.ai` : null,
          quotaRemaining: decision.quotaRemaining ?? null,
        },
        report,
      },
      { headers: decision.headers }
    );
  } catch (err) {
    const code = err instanceof Error ? err.message : "PREFLIGHT_FAILED";
    return NextResponse.json(
      { error: code, message: "Invalid preflight parameters (check from, to, value, data)." },
      { status: 400, headers: decision.headers }
    );
  }
}

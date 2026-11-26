import { NextResponse } from "next/server";
import { evaluateGate402Request } from "@gate402/middleware";
import { FLAGSHIP_SERVICES, getServerConfig } from "@/lib/config";
import { runBscDexIntel, runBscSafetyAudit, runBscTxPreflight } from "@/lib/bsc-intel";

const MCP_TOOLS = [
  {
    name: "gate402_protocol_info",
    description:
      "Returns Gate402 BSC Mainnet contract addresses, HandleRegistry address, available services, and x402 v2 payment parameters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "bsc_safety_audit",
    description:
      "Audits a deployed BNB Smart Chain smart contract for honeypots, taxes, hidden owners, and bytecode privileges. Blocks personal EOA wallet lookups.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "0x BSC smart contract address" },
      },
      required: ["address"],
    },
  },
  {
    name: "bsc_dex_intel",
    description:
      "Returns live PancakeSwap & BSC DEX liquidity depth, 24h volume, buy/sell pressure, and pool health for a BSC token contract.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "0x BSC token contract address" },
      },
      required: ["address"],
    },
  },
  {
    name: "bsc_tx_preflight",
    description:
      "Simulates raw BSC calldata via eth_call & eth_estimateGas, decodes 4-byte selectors, and warns on unlimited ERC-20 approvals before signing.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Sender wallet address" },
        to: { type: "string", description: "Target contract address" },
        value: { type: "string", description: "Value in wei (default 0)" },
        data: { type: "string", description: "Hex calldata (default 0x)" },
      },
      required: ["from", "to"],
    },
  },
] as const;

export async function GET() {
  const cfg = getServerConfig();
  return NextResponse.json({
    name: "gate402-mcp",
    version: "1.0.0",
    protocol: "MCP Streamable HTTP (JSON-RPC 2.0)",
    endpoint: `${cfg.appUrl}/api/mcp`,
    tools: MCP_TOOLS.map((t) => t.name),
  });
}

export async function POST(request: Request) {
  let body: {
    jsonrpc?: string;
    id?: string | number | null;
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown> };
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 }
    );
  }

  const id = body.id ?? null;
  const cfg = getServerConfig();

  if (body.method === "initialize") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "gate402-mcp", version: "1.0.0" },
      },
    });
  }

  if (body.method === "tools/list") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: { tools: MCP_TOOLS },
    });
  }

  if (body.method === "tools/call") {
    const toolName = body.params?.name ?? "";
    const args = body.params?.arguments ?? {};

    if (toolName === "gate402_protocol_info") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  chainId: 56,
                  agentIdRegistry: cfg.agentIdRegistryAddress,
                  gate402Registry: cfg.gate402ContractAddress ?? "pending-deployment",
                  authFlow:
                    "Pass X-Agent-Address, X-Agent-Timestamp, X-Agent-Signature headers for 25–50 free calls/day per .ai handle, or PAYMENT-SIGNATURE (x402 v2).",
                  services: FLAGSHIP_SERVICES.map((s) => ({
                    slug: s.slug,
                    endpoint: `${cfg.appUrl}${s.path}`,
                    freeCallsPerDay: s.freeCallsPerDay,
                    x402Overflow: s.priceUsdtLabel,
                  })),
                },
                null,
                2
              ),
            },
          ],
        },
      });
    }

    const svc =
      toolName === "bsc_safety_audit"
        ? FLAGSHIP_SERVICES[0]
        : toolName === "bsc_dex_intel"
          ? FLAGSHIP_SERVICES[1]
          : toolName === "bsc_tx_preflight"
            ? FLAGSHIP_SERVICES[2]
            : null;

    if (!svc) {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      });
    }

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
          jsonrpc: "2.0",
          id,
          error: {
            code: -32002,
            message: `Gate402 Payment or Agent ID Required (${decision.reason})`,
            data: {
              httpStatus: decision.status,
              paymentRequiredHeader: decision.x402Challenge?.headerValue ?? null,
              x402: decision.x402Challenge?.payload ?? null,
            },
          },
        },
        { status: decision.status, headers: decision.headers }
      );
    }

    try {
      const output =
        toolName === "bsc_safety_audit"
          ? await runBscSafetyAudit(String(args.address ?? ""), cfg.rpcUrl)
          : toolName === "bsc_dex_intel"
            ? await runBscDexIntel(String(args.address ?? ""), cfg.rpcUrl)
            : await runBscTxPreflight(
                {
                  from: String(args.from ?? ""),
                  to: String(args.to ?? ""),
                  value: args.value ? String(args.value) : undefined,
                  data: args.data ? String(args.data) : undefined,
                },
                cfg.rpcUrl
              );

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          },
        },
        { headers: decision.headers }
      );
    } catch (err) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: err instanceof Error ? err.message : "Tool execution failed",
          },
        },
        { status: 400, headers: decision.headers }
      );
    }
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unsupported MCP method: ${body.method ?? ""}` },
  });
}

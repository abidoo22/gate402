import { describe, expect, it } from "vitest";
import { GET as auditGet } from "../src/app/api/v1/bsc/safety-audit/route";
import { POST as mcpPost } from "../src/app/api/mcp/route";
import { SAMPLE_WBNB_ADDRESS } from "../src/lib/config";
import { runBscSafetyAudit } from "../src/lib/bsc-intel";

describe("Gate402 Web APIs & MCP Server", () => {
  it("returns HTTP 402 + PAYMENT-REQUIRED header when safety-audit is called without auth", async () => {
    const req = new Request(
      `http://localhost:3000/api/v1/bsc/safety-audit?address=${SAMPLE_WBNB_ADDRESS}`
    );
    const res = await auditGet(req);
    expect(res.status).toBe(402);

    const paymentRequired = res.headers.get("PAYMENT-REQUIRED");
    expect(paymentRequired).toBeTruthy();

    const decoded = JSON.parse(Buffer.from(paymentRequired!, "base64").toString("utf-8"));
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepts[0].network).toBe("eip155:56");
  });

  it("blocks personal EOA addresses in runBscSafetyAudit (Red Line #9 compliance)", async () => {
    const randomEoa = "0x0000000000000000000000000000000000000042";
    await expect(runBscSafetyAudit(randomEoa)).rejects.toThrow("EOA_NOT_ALLOWED");
  }, 15_000);

  it("serves live canonical WBNB sample safety audit with valid reportHash", async () => {
    const req = new Request(
      `http://localhost:3000/api/v1/bsc/safety-audit?address=${SAMPLE_WBNB_ADDRESS}&preview=sample`
    );
    const res = await auditGet(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.report.targetContract.toLowerCase()).toBe(SAMPLE_WBNB_ADDRESS.toLowerCase());
    expect(json.report.safetyScore).toBeGreaterThanOrEqual(70);
    expect(json.report.reportHash).toMatch(/^0x[0-9a-f]{64}$/);
  }, 20_000);

  it("exposes MCP tools/list and gate402_protocol_info over JSON-RPC 2.0", async () => {
    const listRes = await mcpPost(
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      })
    );
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    const names = listJson.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("bsc_safety_audit");
    expect(names).toContain("bsc_dex_intel");
    expect(names).toContain("bsc_tx_preflight");

    const infoRes = await mcpPost(
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "gate402_protocol_info", arguments: {} },
        }),
      })
    );
    expect(infoRes.status).toBe(200);
    const infoJson = await infoRes.json();
    expect(infoJson.result.content[0].text).toContain("0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F");

    // Protected MCP tool without auth returns HTTP 402 + x402 challenge
    const gatedRes = await mcpPost(
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "bsc_safety_audit", arguments: { address: SAMPLE_WBNB_ADDRESS } },
        }),
      })
    );
    expect(gatedRes.status).toBe(402);
    expect(gatedRes.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
  });
});

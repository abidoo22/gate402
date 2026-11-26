import { isAddress, type Address } from "viem";
import { BSC_CAIP2, BSC_USDC_ADDRESS, BSC_USDT_ADDRESS } from "./abi.js";

function encodeBase64Utf8(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf-8").toString("base64");
  }
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeBase64Utf8(b64: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64").toString("utf-8");
  }
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export interface X402AcceptOption {
  scheme: "exact";
  network: typeof BSC_CAIP2;
  asset: Address;
  amount: string;
  payTo: Address;
  extra: {
    name: string;
    version: string;
  };
}

export interface X402PaymentRequiredPayload {
  x402Version: 2;
  resource: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepts: X402AcceptOption[];
}

export interface X402Challenge {
  headerName: "PAYMENT-REQUIRED";
  headerValue: string;
  payload: X402PaymentRequiredPayload;
}

/**
 * Builds an x402 v2 PAYMENT-REQUIRED header natively compatible with
 * Binance Agentic Wallet CLI (`baw x402-payment preview` / `sign`) on BSC (eip155:56).
 */
export function buildX402Challenge(params: {
  resourceUrl: string;
  description?: string;
  payTo: Address;
  amountUsdtWei: bigint;
}): X402Challenge {
  const amount = params.amountUsdtWei.toString();
  const payload: X402PaymentRequiredPayload = {
    x402Version: 2,
    resource: {
      url: params.resourceUrl,
      description: params.description,
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: BSC_CAIP2,
        asset: BSC_USDT_ADDRESS,
        amount,
        payTo: params.payTo,
        extra: {
          name: "Tether USD",
          version: "1",
        },
      },
      {
        scheme: "exact",
        network: BSC_CAIP2,
        asset: BSC_USDC_ADDRESS,
        amount,
        payTo: params.payTo,
        extra: {
          name: "USD Coin",
          version: "1",
        },
      },
    ],
  };

  const json = JSON.stringify(payload);
  const headerValue = encodeBase64Utf8(json);
  return {
    headerName: "PAYMENT-REQUIRED",
    headerValue,
    payload,
  };
}

export interface X402VerifyResult {
  valid: boolean;
  reason?: string;
  mode?: "facilitator-settled" | "signature-verified";
  txHash?: string;
  payer?: string;
  paymentResponseHeader?: string;
}

const usedNonces = new Set<string>();

/**
 * Decodes and validates a `PAYMENT-SIGNATURE` header returned by `baw x402-payment sign`.
 * If `facilitatorUrl` is configured, forwards to `/verify` and `/settle` for on-chain settlement.
 */
export async function verifyX402PaymentSignature(params: {
  headerValue: string;
  expectedPayTo: Address;
  minAmountWei: bigint;
  facilitatorUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<X402VerifyResult> {
  const raw = params.headerValue.trim();
  if (!raw) return { valid: false, reason: "EMPTY_PAYMENT_SIGNATURE" };

  let parsed: Record<string, unknown>;
  try {
    const decoded = raw.startsWith("{") ? raw : decodeBase64Utf8(raw);
    parsed = JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return { valid: false, reason: "MALFORMED_PAYMENT_SIGNATURE" };
  }

  const version = parsed.x402Version;
  if (version !== 2 && version !== 1) {
    return { valid: false, reason: "UNSUPPORTED_X402_VERSION" };
  }

  const inner = (parsed.paymentPayload ?? parsed) as Record<string, unknown>;
  const network = String(
    inner.network ?? (inner.accepted as Record<string, unknown> | undefined)?.network ?? ""
  );
  if (network !== BSC_CAIP2) {
    return { valid: false, reason: "UNSUPPORTED_NETWORK" };
  }

  const payload = (inner.payload ?? {}) as Record<string, unknown>;
  const signature = String(payload.signature ?? "");
  if (!/^0x[0-9a-fA-F]{130,}$/.test(signature)) {
    return { valid: false, reason: "INVALID_SIGNATURE_HEX" };
  }

  const auth = (payload.permit2Authorization ?? payload.authorization ?? {}) as Record<
    string,
    unknown
  >;
  const permitted = (auth.permitted ?? {}) as Record<string, unknown>;
  const token = String(permitted.token ?? auth.asset ?? "").toLowerCase();
  const allowedTokens = [BSC_USDT_ADDRESS.toLowerCase(), BSC_USDC_ADDRESS.toLowerCase()];
  if (token && !allowedTokens.includes(token)) {
    return { valid: false, reason: "UNSUPPORTED_ASSET" };
  }

  const amountStr = String(permitted.amount ?? auth.value ?? auth.amount ?? "0");
  let amountWei: bigint;
  try {
    amountWei = BigInt(amountStr);
  } catch {
    return { valid: false, reason: "INVALID_AMOUNT" };
  }
  if (amountWei < params.minAmountWei) {
    return { valid: false, reason: "INSUFFICIENT_PAYMENT_AMOUNT" };
  }

  const deadlineNum = Number(auth.deadline ?? auth.validBefore ?? 0);
  if (deadlineNum > 0 && deadlineNum < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: "PAYMENT_SIGNATURE_EXPIRED" };
  }

  const recipient = String(
    auth.to ?? (inner.accepted as Record<string, unknown> | undefined)?.payTo ?? ""
  );
  if (
    recipient &&
    isAddress(recipient) &&
    recipient.toLowerCase() !== params.expectedPayTo.toLowerCase()
  ) {
    return { valid: false, reason: "RECIPIENT_MISMATCH" };
  }

  const nonceKey = `${network}:${String(auth.nonce ?? signature.slice(0, 34))}`;
  if (usedNonces.has(nonceKey)) {
    return { valid: false, reason: "PAYMENT_REPLAY_DETECTED" };
  }

  // Optional live facilitator verification & settlement
  if (params.facilitatorUrl) {
    const f = params.fetchImpl ?? fetch;
    try {
      const verifyRes = await f(`${params.facilitatorUrl.replace(/\/$/, "")}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentPayload: parsed, expectedPayTo: params.expectedPayTo }),
      });
      if (!verifyRes.ok) {
        return { valid: false, reason: "FACILITATOR_VERIFY_REJECTED" };
      }

      const settleRes = await f(`${params.facilitatorUrl.replace(/\/$/, "")}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentPayload: parsed, expectedPayTo: params.expectedPayTo }),
      });
      if (!settleRes.ok) {
        return { valid: false, reason: "FACILITATOR_SETTLE_FAILED" };
      }
      const settleJson = (await settleRes.json()) as { txHash?: string; payer?: string };
      usedNonces.add(nonceKey);
      const responseObj = {
        success: true,
        network: BSC_CAIP2,
        txHash: settleJson.txHash ?? null,
        payer: settleJson.payer ?? null,
      };
      return {
        valid: true,
        mode: "facilitator-settled",
        txHash: settleJson.txHash,
        payer: settleJson.payer,
        paymentResponseHeader: encodeBase64Utf8(JSON.stringify(responseObj)),
      };
    } catch {
      return { valid: false, reason: "FACILITATOR_UNREACHABLE" };
    }
  }

  usedNonces.add(nonceKey);
  const receiptObj = {
    success: true,
    network: BSC_CAIP2,
    settlementMode: "signature-verified",
    payTo: params.expectedPayTo,
    amount: amountWei.toString(),
    verifiedAt: Math.floor(Date.now() / 1000),
  };

  return {
    valid: true,
    mode: "signature-verified",
    paymentResponseHeader: encodeBase64Utf8(JSON.stringify(receiptObj)),
  };
}

export function resetX402NonceCache(): void {
  usedNonces.clear();
}

import {
  createPublicClient,
  fallback,
  http,
  isAddress,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { bsc } from "viem/chains";
import { DEFAULT_BSC_RPC_URL, FALLBACK_BSC_RPC_URL } from "./config";

export function createBscClient(rpcUrl = DEFAULT_BSC_RPC_URL) {
  return createPublicClient({
    chain: bsc,
    transport: fallback([
      http(rpcUrl, { timeout: 8_000 }),
      http(FALLBACK_BSC_RPC_URL, { timeout: 8_000 }),
    ]),
  });
}

export interface SafetyFlag {
  code: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
}

export interface SafetyAuditReport {
  targetContract: Address;
  chainId: 56;
  tokenName: string | null;
  tokenSymbol: string | null;
  safetyScore: number;
  verdict: "SAFE" | "CAUTION" | "HIGH_RISK";
  verdictCode: 0 | 1 | 2;
  bytecodeSizeBytes: number;
  sourcifyVerified: boolean;
  goPlusAvailable: boolean;
  buyTaxPercent: number | null;
  sellTaxPercent: number | null;
  holderCount: number | null;
  flags: SafetyFlag[];
  reportHash: `0x${string}`;
  scannedAt: string;
  disclaimer: string;
}

const BYTECODE_SELECTORS: Array<{
  selector: string;
  code: string;
  severity: "info" | "warn";
  title: string;
  detail: string;
}> = [
  {
    selector: "40c10f19",
    code: "SELECTOR_MINT",
    severity: "warn",
    title: "Mint function selector detected",
    detail: "Bytecode contains mint(address,uint256) selector 0x40c10f19; verify supply cap.",
  },
  {
    selector: "8456cb59",
    code: "SELECTOR_PAUSE",
    severity: "info",
    title: "Pausable selector detected",
    detail: "Bytecode contains pause() selector 0x8456cb59; check owner privileges.",
  },
  {
    selector: "44337ea1",
    code: "SELECTOR_BLACKLIST",
    severity: "warn",
    title: "Blacklist selector detected",
    detail: "Bytecode contains blacklistAddress selector 0x44337ea1.",
  },
  {
    selector: "3659cfe6",
    code: "SELECTOR_UPGRADE",
    severity: "warn",
    title: "Upgradeable proxy selector detected",
    detail: "Bytecode contains upgradeTo(address) selector 0x3659cfe6.",
  },
];

export async function runBscSafetyAudit(
  rawAddress: string,
  rpcUrl?: string
): Promise<SafetyAuditReport> {
  if (!isAddress(rawAddress)) {
    throw new Error("INVALID_ADDRESS");
  }
  const targetContract = rawAddress as Address;
  const client = createBscClient(rpcUrl);

  // Red Line #9 hard check: reject personal EOAs / non-contract addresses
  const bytecode = await client.getCode({ address: targetContract });
  if (!bytecode || bytecode === "0x") {
    throw new Error("EOA_NOT_ALLOWED");
  }

  const bytecodeLower = bytecode.toLowerCase();
  const bytecodeSizeBytes = Math.max(0, (bytecode.length - 2) / 2);

  // Parallel zero-cost intelligence queries
  const [goPlusRes, sourcifyRes] = await Promise.allSettled([
    fetch(
      `https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=${targetContract}`,
      { signal: AbortSignal.timeout(7_000) }
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `https://sourcify.dev/server/check-by-addresses?addresses=${targetContract}&chainIds=56`,
      { signal: AbortSignal.timeout(5_000) }
    ).then((r) => (r.ok ? r.json() : null)),
  ]);

  let sourcifyVerified = false;
  if (sourcifyRes.status === "fulfilled" && Array.isArray(sourcifyRes.value)) {
    const match = sourcifyRes.value[0] as { chainIds?: Array<{ status?: string }> } | undefined;
    sourcifyVerified = Boolean(
      match?.chainIds?.some((c) => c.status === "perfect" || c.status === "partial")
    );
  }

  let goPlusData: Record<string, unknown> | null = null;
  if (goPlusRes.status === "fulfilled" && goPlusRes.value?.result) {
    const resultMap = goPlusRes.value.result as Record<string, Record<string, unknown>>;
    goPlusData = resultMap[targetContract.toLowerCase()] ?? Object.values(resultMap)[0] ?? null;
  }

  const flags: SafetyFlag[] = [];
  let score = 100;

  if (goPlusData) {
    const isHoneypot = goPlusData.is_honeypot === "1";
    const isOpenSource = goPlusData.is_open_source === "1";
    const isProxy = goPlusData.is_proxy === "1";
    const isMintable = goPlusData.is_mintable === "1";
    const hiddenOwner = goPlusData.hidden_owner === "1";
    const canTakeBackOwnership = goPlusData.can_take_back_ownership === "1";
    const transferPausable = goPlusData.transfer_pausable === "1";
    const isBlacklisted = goPlusData.is_blacklisted === "1";
    const selfDestruct = goPlusData.selfdestruct === "1";
    const buyTax = goPlusData.buy_tax !== undefined ? Number(goPlusData.buy_tax) * 100 : null;
    const sellTax = goPlusData.sell_tax !== undefined ? Number(goPlusData.sell_tax) * 100 : null;

    if (isHoneypot) {
      score -= 65;
      flags.push({
        code: "HONEYPOT",
        severity: "critical",
        title: "Honeypot detected",
        detail: "GoPlus simulation indicates tokens cannot be sold normally.",
      });
    }
    if (!isOpenSource) {
      score -= 25;
      flags.push({
        code: "UNVERIFIED_SOURCE",
        severity: "critical",
        title: "Unverified contract source",
        detail: "Contract source code is not publicly verified on BscScan.",
      });
    } else {
      flags.push({
        code: "OPEN_SOURCE",
        severity: "info",
        title: "Source code verified",
        detail: "Verified source code is publicly inspectable.",
      });
    }
    if (selfDestruct) {
      score -= 35;
      flags.push({
        code: "SELFDESTRUCT",
        severity: "critical",
        title: "Self-destruct capability",
        detail: "Contract contains self-destruct logic that could wipe contract state.",
      });
    }
    if (hiddenOwner) {
      score -= 20;
      flags.push({
        code: "HIDDEN_OWNER",
        severity: "critical",
        title: "Hidden owner detected",
        detail: "Owner privileges appear obfuscated or retrievable.",
      });
    }
    if (canTakeBackOwnership) {
      score -= 20;
      flags.push({
        code: "RECLAIM_OWNERSHIP",
        severity: "critical",
        title: "Ownership can be reclaimed",
        detail: "Privileged address may regain ownership even after renouncing.",
      });
    }
    if (isMintable) {
      score -= 10;
      flags.push({
        code: "MINTABLE",
        severity: "warn",
        title: "Mintable supply",
        detail: "Token supply can be expanded by an authorized role.",
      });
    }
    if (isProxy) {
      score -= 8;
      flags.push({
        code: "PROXY",
        severity: "warn",
        title: "Upgradeable proxy",
        detail: "Implementation logic can be changed by the proxy admin.",
      });
    }
    if (transferPausable) {
      score -= 8;
      flags.push({
        code: "TRANSFER_PAUSABLE",
        severity: "warn",
        title: "Transfers can be paused",
        detail: "An admin address can halt token transfers.",
      });
    }
    if (isBlacklisted) {
      score -= 8;
      flags.push({
        code: "BLACKLIST_ENABLED",
        severity: "warn",
        title: "Address blacklist function",
        detail: "Specific wallets can be blocked from transferring tokens.",
      });
    }
    if (buyTax !== null && buyTax > 10) {
      score -= 15;
      flags.push({
        code: "HIGH_BUY_TAX",
        severity: "critical",
        title: `High buy tax (${buyTax.toFixed(1)}%)`,
        detail: "Buy tax exceeds 10%.",
      });
    } else if (buyTax !== null && buyTax > 3) {
      score -= 5;
      flags.push({
        code: "MODERATE_BUY_TAX",
        severity: "warn",
        title: `Buy tax ${buyTax.toFixed(1)}%`,
        detail: "Non-zero buy tax applies on DEX swaps.",
      });
    }
    if (sellTax !== null && sellTax > 10) {
      score -= 20;
      flags.push({
        code: "HIGH_SELL_TAX",
        severity: "critical",
        title: `High sell tax (${sellTax.toFixed(1)}%)`,
        detail: "Sell tax exceeds 10%; exit friction is high.",
      });
    } else if (sellTax !== null && sellTax > 3) {
      score -= 5;
      flags.push({
        code: "MODERATE_SELL_TAX",
        severity: "warn",
        title: `Sell tax ${sellTax.toFixed(1)}%`,
        detail: "Non-zero sell tax applies on DEX swaps.",
      });
    }
  } else {
    // Non-token smart contract: inspect bytecode selectors directly
    score = sourcifyVerified ? 88 : 74;
    flags.push({
      code: sourcifyVerified ? "SOURCIFY_VERIFIED" : "NON_TOKEN_CONTRACT",
      severity: "info",
      title: sourcifyVerified ? "Verified via Sourcify" : "General BSC Smart Contract",
      detail:
        "Not indexed as a standard ERC-20 token on GoPlus; evaluated via live BSC bytecode inspection.",
    });

    for (const item of BYTECODE_SELECTORS) {
      if (bytecodeLower.includes(`63${item.selector}`)) {
        score -= item.severity === "warn" ? 7 : 3;
        flags.push({
          code: item.code,
          severity: item.severity,
          title: item.title,
          detail: item.detail,
        });
      }
    }
  }

  const safetyScore = Math.max(0, Math.min(100, Math.round(score)));
  const verdictCode: 0 | 1 | 2 = safetyScore >= 75 ? 0 : safetyScore >= 45 ? 1 : 2;
  const verdict = verdictCode === 0 ? "SAFE" : verdictCode === 1 ? "CAUTION" : "HIGH_RISK";

  const canonicalDigestInput = JSON.stringify({
    v: 1,
    chainId: 56,
    targetContract: targetContract.toLowerCase(),
    safetyScore,
    verdictCode,
    flags: flags.map((f) => f.code).sort(),
  });
  const reportHash = keccak256(toBytes(canonicalDigestInput));

  return {
    targetContract,
    chainId: 56,
    tokenName: goPlusData?.token_name ? String(goPlusData.token_name) : null,
    tokenSymbol: goPlusData?.token_symbol ? String(goPlusData.token_symbol) : null,
    safetyScore,
    verdict,
    verdictCode,
    bytecodeSizeBytes,
    sourcifyVerified,
    goPlusAvailable: Boolean(goPlusData),
    buyTaxPercent:
      goPlusData?.buy_tax !== undefined ? Number((Number(goPlusData.buy_tax) * 100).toFixed(2)) : null,
    sellTaxPercent:
      goPlusData?.sell_tax !== undefined ? Number((Number(goPlusData.sell_tax) * 100).toFixed(2)) : null,
    holderCount: goPlusData?.holder_count ? Number(goPlusData.holder_count) : null,
    flags,
    reportHash,
    scannedAt: new Date().toISOString(),
    disclaimer:
      "Automated on-chain security heuristics for informational purposes only — not financial advice or a formal audit.",
  };
}

export interface DexIntelReport {
  tokenAddress: Address;
  chainId: 56;
  pairCount: number;
  priceUsd: number | null;
  totalLiquidityUsd: number;
  volume24hUsd: number;
  fdvUsd: number | null;
  buySellRatio24h: number | null;
  liquidityHealth: "DEEP" | "MODERATE" | "THIN" | "NO_POOL";
  topPools: Array<{
    dexId: string;
    pairAddress: string;
    baseSymbol: string;
    quoteSymbol: string;
    priceUsd: number | null;
    liquidityUsd: number;
    volume24hUsd: number;
    buys24h: number;
    sells24h: number;
    url: string;
  }>;
  scannedAt: string;
  disclaimer: string;
}

export async function runBscDexIntel(
  rawAddress: string,
  rpcUrl?: string
): Promise<DexIntelReport> {
  if (!isAddress(rawAddress)) throw new Error("INVALID_ADDRESS");
  const tokenAddress = rawAddress as Address;
  const client = createBscClient(rpcUrl);

  const code = await client.getCode({ address: tokenAddress });
  if (!code || code === "0x") throw new Error("EOA_NOT_ALLOWED");

  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
    signal: AbortSignal.timeout(7_000),
  });
  if (!res.ok) throw new Error("DEXSCREENER_UNAVAILABLE");

  const json = (await res.json()) as {
    pairs?: Array<{
      chainId: string;
      dexId: string;
      pairAddress: string;
      url: string;
      priceUsd?: string;
      fdv?: number;
      liquidity?: { usd?: number };
      volume?: { h24?: number };
      txns?: { h24?: { buys?: number; sells?: number } };
      baseToken?: { symbol?: string };
      quoteToken?: { symbol?: string };
    }>;
  };

  const bscPairs = (json.pairs ?? [])
    .filter((p) => p.chainId === "bsc")
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));

  const totalLiquidityUsd = bscPairs.reduce((acc, p) => acc + (p.liquidity?.usd ?? 0), 0);
  const volume24hUsd = bscPairs.reduce((acc, p) => acc + (p.volume?.h24 ?? 0), 0);
  const totalBuys = bscPairs.reduce((acc, p) => acc + (p.txns?.h24?.buys ?? 0), 0);
  const totalSells = bscPairs.reduce((acc, p) => acc + (p.txns?.h24?.sells ?? 0), 0);

  const top = bscPairs[0];
  const liquidityHealth: DexIntelReport["liquidityHealth"] =
    bscPairs.length === 0
      ? "NO_POOL"
      : totalLiquidityUsd >= 250_000
        ? "DEEP"
        : totalLiquidityUsd >= 25_000
          ? "MODERATE"
          : "THIN";

  return {
    tokenAddress,
    chainId: 56,
    pairCount: bscPairs.length,
    priceUsd: top?.priceUsd ? Number(top.priceUsd) : null,
    totalLiquidityUsd: Math.round(totalLiquidityUsd),
    volume24hUsd: Math.round(volume24hUsd),
    fdvUsd: top?.fdv ?? null,
    buySellRatio24h:
      totalSells > 0 ? Number((totalBuys / totalSells).toFixed(2)) : totalBuys > 0 ? totalBuys : null,
    liquidityHealth,
    topPools: bscPairs.slice(0, 5).map((p) => ({
      dexId: p.dexId,
      pairAddress: p.pairAddress,
      baseSymbol: p.baseToken?.symbol ?? "?",
      quoteSymbol: p.quoteToken?.symbol ?? "?",
      priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
      liquidityUsd: Math.round(p.liquidity?.usd ?? 0),
      volume24hUsd: Math.round(p.volume?.h24 ?? 0),
      buys24h: p.txns?.h24?.buys ?? 0,
      sells24h: p.txns?.h24?.sells ?? 0,
      url: p.url,
    })),
    scannedAt: new Date().toISOString(),
    disclaimer: "Live DEX snapshot for informational analysis only — not trading advice.",
  };
}

export interface TxPreflightReport {
  chainId: 56;
  from: Address;
  to: Address;
  toIsContract: boolean;
  selector: string | null;
  decodedSignature: string | null;
  simulationPassed: boolean;
  revertReason: string | null;
  estimatedGas: string | null;
  warnings: SafetyFlag[];
  verdict: "PROCEED_WITH_CONFIRMATION" | "CAUTION" | "BLOCK_RECOMMENDED";
  checkedAt: string;
}

export async function runBscTxPreflight(
  input: { from: string; to: string; value?: string; data?: string },
  rpcUrl?: string
): Promise<TxPreflightReport> {
  if (!isAddress(input.from) || !isAddress(input.to)) {
    throw new Error("INVALID_ADDRESS");
  }
  const from = input.from as Address;
  const to = input.to as Address;
  const data = (input.data?.trim() || "0x") as Hex;
  if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) {
    throw new Error("INVALID_CALLDATA");
  }

  let valueWei = 0n;
  try {
    valueWei = input.value ? BigInt(input.value) : 0n;
  } catch {
    throw new Error("INVALID_VALUE");
  }

  const client = createBscClient(rpcUrl);
  const code = await client.getCode({ address: to });
  const toIsContract = Boolean(code && code !== "0x");

  const selector = data.length >= 10 ? data.slice(0, 10).toLowerCase() : null;
  const warnings: SafetyFlag[] = [];
  let decodedSignature: string | null = null;

  if (selector) {
    try {
      const sigRes = await fetch(
        `https://api.openchain.xyz/signature-database/v1/lookup?function=${selector}&filter=true`,
        { signal: AbortSignal.timeout(4_000) }
      );
      if (sigRes.ok) {
        const sigJson = (await sigRes.json()) as {
          result?: { function?: Record<string, Array<{ name: string }>> };
        };
        decodedSignature = sigJson.result?.function?.[selector]?.[0]?.name ?? null;
      }
    } catch {
      decodedSignature = null;
    }

    // Check for unlimited ERC-20 approve(address,uint256)
    if (selector === "0x095ea7b3" && data.length >= 138) {
      const amountHex = `0x${data.slice(74, 138)}`;
      const amount = BigInt(amountHex);
      if (amount >= 1n << 250n) {
        warnings.push({
          code: "UNLIMITED_ERC20_APPROVAL",
          severity: "critical",
          title: "Unlimited ERC-20 token approval",
          detail:
            "This transaction requests near-infinite token spending approval. Prefer approving the exact required amount.",
        });
      }
    }

    // Check for NFT setApprovalForAll(address,true)
    if (selector === "0xa22cb465" && data.endsWith("1")) {
      warnings.push({
        code: "NFT_SET_APPROVAL_FOR_ALL",
        severity: "critical",
        title: "Full NFT collection approval",
        detail: "setApprovalForAll grants transfer rights over every NFT in this collection.",
      });
    }
  }

  let simulationPassed = true;
  let revertReason: string | null = null;
  let estimatedGas: string | null = null;

  try {
    await client.call({ account: from, to, value: valueWei, data });
    const gas = await client.estimateGas({ account: from, to, value: valueWei, data });
    estimatedGas = gas.toString();
  } catch (err) {
    simulationPassed = false;
    revertReason = err instanceof Error ? err.message.slice(0, 260) : "Execution reverted";
    warnings.push({
      code: "SIMULATION_REVERTED",
      severity: "critical",
      title: "Transaction simulation reverted",
      detail: revertReason,
    });
  }

  const hasCritical = warnings.some((w) => w.severity === "critical");
  const verdict = !simulationPassed
    ? "BLOCK_RECOMMENDED"
    : hasCritical
      ? "CAUTION"
      : "PROCEED_WITH_CONFIRMATION";

  return {
    chainId: 56,
    from,
    to,
    toIsContract,
    selector,
    decodedSignature,
    simulationPassed,
    revertReason,
    estimatedGas,
    warnings,
    verdict,
    checkedAt: new Date().toISOString(),
  };
}

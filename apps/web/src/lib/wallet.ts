"use client";

import {
  createWalletClient,
  custom,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { bsc } from "viem/chains";
import {
  GATE402_REGISTRY_ABI,
  buildGate402AuthMessage,
  serviceSlugHash,
} from "@gate402/middleware";

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export async function connectBscWallet(): Promise<Address> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error(
      "No Web3 wallet detected. Open Gate402 inside Binance Wallet dApp browser or install a browser wallet extension."
    );
  }

  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error("Wallet connection was cancelled.");
  }

  // Ensure BNB Smart Chain Mainnet (chainId 56 = 0x38)
  const chainIdHex = (await window.ethereum.request({ method: "eth_chainId" })) as string;
  if (chainIdHex?.toLowerCase() !== "0x38") {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x38" }],
      });
    } catch {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x38",
            chainName: "BNB Smart Chain Mainnet",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: ["https://bsc-dataseed.binance.org/"],
            blockExplorerUrls: ["https://bscscan.com/"],
          },
        ],
      });
    }
  }

  return accounts[0] as Address;
}

function getClient(account: Address) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("Wallet provider unavailable.");
  }
  return createWalletClient({
    account,
    chain: bsc,
    transport: custom(window.ethereum),
  });
}

export async function signGate402Headers(
  account: Address,
  serviceSlug: string
): Promise<Record<string, string>> {
  const client = getClient(account);
  const timestamp = Math.floor(Date.now() / 1000);
  const message = buildGate402AuthMessage({ serviceSlug, address: account, timestamp });
  const signature = await client.signMessage({ account, message });
  return {
    "x-agent-address": account,
    "x-agent-timestamp": String(timestamp),
    "x-agent-signature": signature,
  };
}

export async function sendActivatePassTx(
  account: Address,
  contractAddress: Address
): Promise<Hex> {
  const client = getClient(account);
  const data = encodeFunctionData({
    abi: GATE402_REGISTRY_ABI,
    functionName: "activatePass",
  });
  return client.sendTransaction({
    account,
    to: contractAddress,
    data,
    value: 0n,
  });
}

export async function sendRefreshDailyPassTx(
  account: Address,
  contractAddress: Address
): Promise<Hex> {
  const client = getClient(account);
  const data = encodeFunctionData({
    abi: GATE402_REGISTRY_ABI,
    functionName: "refreshDailyPass",
  });
  return client.sendTransaction({
    account,
    to: contractAddress,
    data,
    value: 0n,
  });
}

export async function sendRecordAuditTx(params: {
  account: Address;
  contractAddress: Address;
  targetContract: Address;
  safetyScore: number;
  verdictCode: 0 | 1 | 2;
  reportHash: `0x${string}`;
}): Promise<Hex> {
  const client = getClient(params.account);
  const data = encodeFunctionData({
    abi: GATE402_REGISTRY_ABI,
    functionName: "recordAuditDigest",
    args: [params.targetContract, params.safetyScore, params.verdictCode, params.reportHash],
  });
  return client.sendTransaction({
    account: params.account,
    to: params.contractAddress,
    data,
    value: 0n,
  });
}

export async function sendRegisterServiceTx(params: {
  account: Address;
  contractAddress: Address;
  slug: string;
  name: string;
  endpointUrl: string;
  freeCallsPerDay: number;
  priceUsdtWei: bigint;
  payTo: Address;
}): Promise<Hex> {
  const client = getClient(params.account);
  const data = encodeFunctionData({
    abi: GATE402_REGISTRY_ABI,
    functionName: "registerService",
    args: [
      serviceSlugHash(params.slug),
      params.name,
      params.endpointUrl,
      params.freeCallsPerDay,
      params.priceUsdtWei,
      params.payTo,
    ],
  });
  return client.sendTransaction({
    account: params.account,
    to: params.contractAddress,
    data,
    value: 0n,
  });
}

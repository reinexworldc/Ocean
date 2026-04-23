import { http } from "viem";
import { createRateLimitedFetch } from "./rate-limited-fetch.js";

const DEFAULT_ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network";

const rateLimitedFetch = createRateLimitedFetch();

export function getArcTestnetRpcUrl(): string {
  return (process.env.ARC_TESTNET_RPC_URL ?? DEFAULT_ARC_TESTNET_RPC_URL).trim();
}

/**
 * Shared Arc RPC transport with rate limiting to prevent 429 bursts,
 * especially under multi-agent tool parallelism.
 */
export function arcHttpTransport(url: string = getArcTestnetRpcUrl()) {
  return http(url, { fetchFn: rateLimitedFetch });
}


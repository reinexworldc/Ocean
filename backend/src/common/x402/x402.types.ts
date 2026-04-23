import { type Network } from "@x402/express";

/**
 * A function that receives the incoming HTTP request and returns a price string
 * (e.g. "$0.034"). Called once per request BEFORE the x402 402-challenge is
 * issued, so the caller always pays the exact computed amount.
 */
export type PriceFn = (req: Record<string, unknown>) => Promise<string> | string;

export type X402ChargeOptions = {
  /**
   * Static dollar price like "$0.01", OR a PriceFn that computes the price
   * dynamically (e.g. based on the number of on-chain calls required).
   */
  price: string | PriceFn;
  description: string;
  network?: Network;
  payTo?: string;
  resource?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
};

export type ResolvedX402ChargeOptions = Omit<X402ChargeOptions, "network" | "payTo"> & {
  network: Network;
  payTo: string;
};

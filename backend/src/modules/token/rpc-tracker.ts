import { RPC_COSTS } from "./token-price-estimators.js";

export type RpcCallRecord = {
  /** Human-readable operation name, e.g. "name()", "eth_getLogs batch 1-10000" */
  label: string;
  /** Cost in USD as formatted string, e.g. "$0.0025" */
  costUsd: string;
};

/**
 * Thin tracker that wraps every on-chain operation.
 * Each call is recorded so the response can include a full cost breakdown.
 */
export class RpcTracker {
  private readonly records: RpcCallRecord[] = [];

  async track<T>(label: string, costKey: keyof typeof RPC_COSTS, call: Promise<T>): Promise<T> {
    const result = await call;
    this.records.push({ label, costUsd: `$${RPC_COSTS[costKey].toFixed(4)}` });
    return result;
  }

  /** Record a batch of identical calls (e.g. getLogs across block ranges). */
  trackBatch(labelFn: (i: number) => string, costKey: keyof typeof RPC_COSTS, count: number): void {
    for (let i = 0; i < count; i++) {
      this.records.push({ label: labelFn(i), costUsd: `$${RPC_COSTS[costKey].toFixed(4)}` });
    }
  }

  get breakdown(): RpcCallRecord[] {
    return [...this.records];
  }

  get totalCostUsd(): number {
    return this.records.reduce((sum, r) => sum + parseFloat(r.costUsd.replace("$", "")), 0);
  }

  get totalCostFormatted(): string {
    return `$${this.totalCostUsd.toFixed(4)}`;
  }
}

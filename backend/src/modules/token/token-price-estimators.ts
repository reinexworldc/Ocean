/**
 * Standalone price estimation functions for token endpoints.
 *
 * All three endpoints (transfers, history, holders) now scan only a small
 * fixed window of recent blocks (RECENT_BLOCKS_WINDOW in token.service.ts)
 * instead of the full chain history, so their cost is always near the minimum.
 *
 * Cost model (2-block window):
 *   - eth_blockNumber:         $0.001
 *   - eth_getLogs (2 blocks):  $0.003
 *   - eth_getBlockByNumber:    $0.001 each  (history: up to 2 blocks)
 *   - eth_call balanceOf:      $0.001 each  (holders: few participants in 2 blocks)
 *   - eth_call decimals/etc:   $0.0025 each
 */

// Per-operation costs in USD (fractional cents intentionally visible to users)
export const RPC_COSTS = {
  blockNumber: 0.001,
  binarySearchStep: 0.001,
  getLogsBatch: 0.003,
  getBlock: 0.001,
  balanceOf: 0.001,
  readContract: 0.0025,
  decimals: 0.0025,
  name: 0.0025,
  symbol: 0.0025,
  totalSupply: 0.0025,
} as const;

const MIN_PRICE = 0.01;

/**
 * Price estimation for GET /token/:id/transfers
 *
 * Cost: eth_blockNumber + decimals() + eth_getLogs (2-block window) = $0.0065 → $0.01
 */
export async function estimateTransfersPrice(
  _req: Record<string, unknown>,
): Promise<string> {
  const cost = RPC_COSTS.blockNumber + RPC_COSTS.decimals + RPC_COSTS.getLogsBatch;
  return `$${Math.max(cost, MIN_PRICE).toFixed(4)}`;
}

/**
 * Price estimation for GET /token/:id/history
 *
 * Cost: eth_blockNumber + eth_getLogs (2-block window) + up to 2 × eth_getBlockByNumber
 *       = $0.006 → $0.01
 */
export async function estimateHistoryPrice(
  _req: Record<string, unknown>,
): Promise<string> {
  const cost =
    RPC_COSTS.blockNumber +
    RPC_COSTS.getLogsBatch +
    2 * RPC_COSTS.getBlock;
  return `$${Math.max(cost, MIN_PRICE).toFixed(4)}`;
}

/**
 * Price estimation for GET /token/:id/holders
 *
 * Cost: eth_blockNumber + decimals() + totalSupply() + eth_getLogs (2-block window)
 *       + a few balanceOf calls for participants found in those 2 blocks = $0.01
 */
export async function estimateHoldersPrice(
  _req: Record<string, unknown>,
): Promise<string> {
  const cost =
    RPC_COSTS.blockNumber +
    RPC_COSTS.decimals +
    RPC_COSTS.totalSupply +
    RPC_COSTS.getLogsBatch +
    3 * RPC_COSTS.balanceOf;
  return `$${Math.max(cost, MIN_PRICE).toFixed(4)}`;
}

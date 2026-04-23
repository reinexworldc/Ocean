import { estimateHoldersPrice, estimateHistoryPrice, estimateTransfersPrice } from "../../modules/token/token-price-estimators.js";
import { type X402ChargeOptions } from "./x402.types.js";

export const x402RouteConfigs = {
  getMarketOverview: {
    price: "$0.01",
    description: "Access the aggregated market overview.",
  },
  /**
   * Token details are split into paid sub-endpoints so the UI can show
   * granular, per-step x402 settlements (each has its own tx hash).
   */
  getTokenProfile: {
    price: "$0.01",
    description: "Access token profile metadata (dataset-backed).",
  },
  getTokenErc20: {
    price: "$0.01",
    description: "Access ERC-20 contract metadata (name, symbol, decimals, supply).",
  },
  getTokenTransfers: {
    price: estimateTransfersPrice,
    description: "Access recent on-chain transfer activity for a token.",
  },
  getTokenHolders: {
    price: estimateHoldersPrice,
    description: "Access on-chain holder balances derived from transfer participants.",
  },
  // Backward-compatible: full token card (kept for non-agent callers).
  getTokenById: {
    price: "$0.01",
    description: "Access token metadata and on-chain transfer activity.",
  },
  getTokenHistory: {
    price: estimateHistoryPrice,
    description: "Access token history time series data with on-chain activity.",
  },
  getWalletPortfolio: {
    price: "$0.02",
    description: "Access the wallet portfolio breakdown.",
  },
  buyToken: {
    price: "$0.05",
    description: "Execute a token buy trade request.",
  },
  sellToken: {
    price: "$0.05",
    description: "Execute a token sell trade request.",
  },
  /**
   * Signal Agent endpoint — receives $0.005 per call and internally pays
   * $0.01 to the token profile API, forming the third level of the A2A chain.
   *
   * payTo is the Signal Agent's own receiver address (separate from the main
   * seller address so on-chain flows are clearly distinguishable).
   */
  getSignal: {
    price: "$0.005",
    description: "Get a buy/sell/hold signal for a token from the autonomous Signal Agent ($0.005).",
    payTo: process.env.SIGNAL_AGENT_RECEIVER_ADDRESS,
  },
  getComparison: {
    price: "$0.02",
    description: "Compare an Arc ecosystem token with a major market coin (CoinGecko data).",
  },
} satisfies Record<string, X402ChargeOptions>;

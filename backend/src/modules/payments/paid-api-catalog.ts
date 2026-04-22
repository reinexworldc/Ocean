import { x402RouteConfigs } from "../../common/x402/x402-route-configs.js";

export const HISTORY_PERIODS = ["1h", "24h", "7d", "30d"] as const;

export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

export type PaidApiAction =
  | {
      type: "get_market_overview";
    }
  | {
      type: "get_token_details";
      tokenId: string;
    }
  | {
      type: "get_token_history";
      tokenId: string;
      period: HistoryPeriod;
    }
  | {
      type: "get_wallet_portfolio";
    };

export const paidApiCatalog = {
  getMarketOverview: {
    actionType: "get_market_overview",
    priceUsd: x402RouteConfigs.getMarketOverview.price,
    description: x402RouteConfigs.getMarketOverview.description,
    method: "GET",
    buildPath: () => "/market",
  },
  getTokenDetails: {
    actionType: "get_token_details",
    priceUsd: x402RouteConfigs.getTokenById.price,
    description: x402RouteConfigs.getTokenById.description,
    method: "GET",
    buildPath: (tokenId: string) => `/token/${encodeURIComponent(tokenId)}`,
  },
  getTokenHistory: {
    actionType: "get_token_history",
    priceUsd: x402RouteConfigs.getTokenHistory.price,
    description: x402RouteConfigs.getTokenHistory.description,
    method: "GET",
    buildPath: (tokenId: string, period: HistoryPeriod) =>
      `/token/${encodeURIComponent(tokenId)}/history?period=${encodeURIComponent(period)}`,
  },
  getWalletPortfolio: {
    actionType: "get_wallet_portfolio",
    priceUsd: x402RouteConfigs.getWalletPortfolio.price,
    description: x402RouteConfigs.getWalletPortfolio.description,
    method: "GET",
    buildPath: (walletAddress: string) => `/portfolio/${encodeURIComponent(walletAddress)}`,
  },
} as const;

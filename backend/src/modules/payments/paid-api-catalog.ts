import { x402RouteConfigs } from "../../common/x402/x402-route-configs.js";

export const HISTORY_PERIODS = ["1h", "24h", "7d", "30d"] as const;

export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

export type PaidApiAction =
  | {
      type: "get_market_overview";
    }
  | {
      type: "get_token_profile";
      tokenId: string;
    }
  | {
      type: "get_token_erc20";
      tokenId: string;
    }
  | {
      type: "get_token_transfers";
      tokenId: string;
    }
  | {
      type: "get_token_holders";
      tokenId: string;
    }
  | {
      type: "get_token_history";
      tokenId: string;
      period: HistoryPeriod;
    }
  | {
      type: "get_wallet_portfolio";
    }
  | {
      type: "get_signal";
      tokenId: string;
    }
  | {
      type: "compare_arc_token";
      arcTokenId: string;
      externalCoin: string;
    };

export const paidApiCatalog = {
  getMarketOverview: {
    actionType: "get_market_overview",
    priceUsd: x402RouteConfigs.getMarketOverview.price,
    description: x402RouteConfigs.getMarketOverview.description,
    method: "GET",
    buildPath: () => "/market",
  },
  getTokenProfile: {
    actionType: "get_token_profile",
    priceUsd: x402RouteConfigs.getTokenProfile.price,
    description: x402RouteConfigs.getTokenProfile.description,
    method: "GET",
    buildPath: (tokenId: string) => `/token/${encodeURIComponent(tokenId)}/profile`,
  },
  getTokenErc20: {
    actionType: "get_token_erc20",
    priceUsd: x402RouteConfigs.getTokenErc20.price,
    description: x402RouteConfigs.getTokenErc20.description,
    method: "GET",
    buildPath: (tokenId: string) => `/token/${encodeURIComponent(tokenId)}/erc20`,
  },
  getTokenTransfers: {
    actionType: "get_token_transfers",
    // Dynamic price function — resolved by x402 guard at request time.
    // The catalog uses a static minimum as a conservative estimate for agents.
    priceUsd: "$0.01",
    description: x402RouteConfigs.getTokenTransfers.description,
    method: "GET",
    buildPath: (tokenId: string) => `/token/${encodeURIComponent(tokenId)}/transfers`,
  },
  getTokenHolders: {
    actionType: "get_token_holders",
    // Dynamic price function — resolved by x402 guard at request time.
    // The catalog uses a static minimum as a conservative estimate for agents.
    priceUsd: "$0.01",
    description: x402RouteConfigs.getTokenHolders.description,
    method: "GET",
    buildPath: (tokenId: string) => `/token/${encodeURIComponent(tokenId)}/holders`,
  },
  getTokenHistory: {
    actionType: "get_token_history",
    // Dynamic price function — resolved by x402 guard at request time.
    // The catalog uses a static minimum as a conservative estimate for agents.
    priceUsd: "$0.01",
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
  getSignal: {
    actionType: "get_signal",
    priceUsd: x402RouteConfigs.getSignal.price,
    description: x402RouteConfigs.getSignal.description,
    method: "GET",
    buildPath: (tokenId: string) => `/signals/${encodeURIComponent(tokenId)}`,
  },
  getComparison: {
    actionType: "compare_arc_token",
    priceUsd: x402RouteConfigs.getComparison.price,
    description: x402RouteConfigs.getComparison.description,
    method: "GET",
    buildPath: (arcTokenId: string, externalCoin: string) =>
      `/compare/${encodeURIComponent(arcTokenId)}?vs=${encodeURIComponent(externalCoin)}`,
  },
} as const;

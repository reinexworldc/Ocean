import { BadGatewayException, Inject, Injectable, Logger } from "@nestjs/common";
import { GatewayClient, registerBatchScheme } from "@circle-fin/x402-batching/client";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEFAULT_X402_NETWORK } from "../../common/x402/x402.constants.js";
import { CircleWalletService } from "../circle-wallet/circle-wallet.service.js";

export type TradeSignal = "buy" | "sell" | "hold";

export type SignalResult = {
  tokenId: string;
  signal: TradeSignal;
  confidence: number;
  reasoning: string;
  dataSource: string;
  settlementTransaction: string | null;
  paymentNetwork: string | null;
};

type TokenProfileData = {
  id?: string;
  current?: {
    price?: number;
    change24h?: number;
    change7d?: number;
    volume24h?: number;
    marketCap?: number;
    liquidity?: number;
  };
  sentiment?: string;
  analysis?: string;
};

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  /** Minimum Gateway USDC balance before a top-up is triggered. */
  private readonly GATEWAY_MIN_USDC = 0.05;
  /** Amount to deposit into the Gateway when balance is too low. */
  private readonly GATEWAY_DEPOSIT_USDC = "0.5";
  /** Re-check interval — avoid hitting the RPC on every signal call. */
  private readonly GATEWAY_RECHECK_MS = 60_000;

  private lastGatewayCheckAt = 0;
  private pendingGatewayFunding: Promise<void> | null = null;

  constructor(
    @Inject(CircleWalletService)
    private readonly circleWalletService: CircleWalletService,
  ) {}

  async getSignal(tokenId: string): Promise<SignalResult> {
    const normalizedId = tokenId.toUpperCase();
    this.logger.log(`Signal Agent: computing signal for ${normalizedId}`);

    const { profile, settlementTransaction, paymentNetwork } =
      await this.fetchTokenProfile(normalizedId);

    const result = this.synthesizeSignal(normalizedId, profile);

    return {
      ...result,
      settlementTransaction,
      paymentNetwork,
    };
  }

  private async fetchTokenProfile(tokenId: string) {
    // Provision Circle wallet (idempotent — reads from env after first call).
    const { walletId, walletAddress } =
      await this.circleWalletService.provisionSignalAgentWallet();

    // Ensure the Circle wallet has Gateway USDC for batch x402 payments.
    await this.ensureSignalAgentFunded(walletAddress);

    const path = `/token/${encodeURIComponent(tokenId)}/profile`;
    const url = this.buildInternalUrl(path);

    // Step 1: probe to get the 402 challenge.
    const unsignedResponse = await fetch(url, { headers: { Accept: "application/json" } });

    if (unsignedResponse.status !== 402) {
      throw new BadGatewayException(
        `Signal Agent: expected 402 challenge from ${path}, got ${unsignedResponse.status}`,
      );
    }

    // Step 2: build Circle-backed signer and register batch scheme.
    const signer = await this.circleWalletService.createSignerForWallet(walletId, walletAddress);
    const client = new x402Client();
    registerBatchScheme(client, {
      signer,
      networks: [DEFAULT_X402_NETWORK],
    });
    const httpClient = new x402HTTPClient(client);
    const paymentRequired = httpClient.getPaymentRequiredResponse((name) =>
      unsignedResponse.headers.get(name),
    );

    // Step 3: sign and submit the paid request (up to 2 retries).
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
      const paidResponse = await fetch(url, {
        headers: {
          Accept: "application/json",
          ...httpClient.encodePaymentSignatureHeader(paymentPayload),
        },
      });

      const settlementHeader =
        paidResponse.headers.get("PAYMENT-RESPONSE") ||
        paidResponse.headers.get("X-PAYMENT-RESPONSE");

      if (!settlementHeader && attempt < maxAttempts) {
        this.logger.warn(
          `Signal Agent: no settlement header on attempt ${attempt}, retrying...`,
        );
        continue;
      }

      const rawBody = await paidResponse.text();

      if (!paidResponse.ok) {
        throw new BadGatewayException(
          `Signal Agent: token profile call failed with status ${paidResponse.status}`,
        );
      }

      const profile = JSON.parse(rawBody) as TokenProfileData;

      let settlementTransaction: string | null = null;
      let paymentNetwork: string | null = null;

      if (settlementHeader) {
        try {
          const parsed = JSON.parse(settlementHeader) as {
            transaction?: string;
            network?: string;
          };
          settlementTransaction = parsed.transaction ?? null;
          paymentNetwork = parsed.network ?? null;
        } catch {
          this.logger.warn("Signal Agent: could not parse settlement header");
        }
      }

      this.logger.log(
        `Signal Agent: token profile fetched. Settlement tx: ${settlementTransaction ?? "none"}`,
      );

      return { profile, settlementTransaction, paymentNetwork };
    }

    throw new BadGatewayException("Signal Agent: exhausted retries fetching token profile");
  }

  private synthesizeSignal(
    tokenId: string,
    profile: TokenProfileData,
  ): Omit<SignalResult, "settlementTransaction" | "paymentNetwork"> {
    const change24h = profile.current?.change24h ?? 0;
    const change7d = profile.current?.change7d ?? 0;
    const volume24h = profile.current?.volume24h ?? 0;
    const liquidity = profile.current?.liquidity ?? 0;
    const sentimentRaw = (profile.sentiment ?? "").toLowerCase();

    const isBullishSentiment =
      sentimentRaw.includes("bull") || sentimentRaw.includes("greed") || sentimentRaw.includes("optimis");
    const isBearishSentiment =
      sentimentRaw.includes("bear") || sentimentRaw.includes("fear") || sentimentRaw.includes("pessim");

    const momentumScore = change24h * 0.6 + change7d * 0.4;
    const liquidityAdequate = liquidity > 0 && volume24h > 0;

    let signal: TradeSignal;
    let confidence: number;
    let reasoning: string;

    if (momentumScore > 8 && isBullishSentiment && liquidityAdequate) {
      signal = "buy";
      confidence = Math.min(0.9, 0.6 + momentumScore / 100);
      reasoning = `Strong upward momentum (24h: ${change24h.toFixed(1)}%, 7d: ${change7d.toFixed(1)}%) combined with bullish sentiment. Volume and liquidity are adequate.`;
    } else if (momentumScore > 5 && liquidityAdequate) {
      signal = "buy";
      confidence = Math.min(0.75, 0.5 + momentumScore / 100);
      reasoning = `Positive price trend (24h: ${change24h.toFixed(1)}%, 7d: ${change7d.toFixed(1)}%) with sufficient liquidity. Sentiment: ${profile.sentiment ?? "neutral"}.`;
    } else if (momentumScore < -8 && isBearishSentiment) {
      signal = "sell";
      confidence = Math.min(0.9, 0.6 + Math.abs(momentumScore) / 100);
      reasoning = `Sharp downward pressure (24h: ${change24h.toFixed(1)}%, 7d: ${change7d.toFixed(1)}%) with bearish sentiment. Risk of further decline.`;
    } else if (momentumScore < -5) {
      signal = "sell";
      confidence = Math.min(0.75, 0.5 + Math.abs(momentumScore) / 100);
      reasoning = `Negative price trend (24h: ${change24h.toFixed(1)}%, 7d: ${change7d.toFixed(1)}%). Sentiment: ${profile.sentiment ?? "neutral"}.`;
    } else {
      signal = "hold";
      confidence = 0.5 + Math.abs(momentumScore) / 50;
      reasoning = `Mixed signals: 24h ${change24h.toFixed(1)}%, 7d ${change7d.toFixed(1)}%. Sentiment: ${profile.sentiment ?? "neutral"}. Insufficient directional conviction to recommend action.`;
    }

    confidence = Math.max(0.1, Math.min(0.95, confidence));

    return {
      tokenId,
      signal,
      confidence: Math.round(confidence * 100) / 100,
      reasoning,
      dataSource: `/token/${tokenId}/profile (x402 $0.01)`,
    };
  }

  /**
   * Ensures the Signal Agent's Circle wallet has USDC in Circle's Gateway
   * contract. Runs at most once per GATEWAY_RECHECK_MS.
   */
  private ensureSignalAgentFunded(walletAddress: string): Promise<void> {
    if (Date.now() - this.lastGatewayCheckAt < this.GATEWAY_RECHECK_MS) {
      return Promise.resolve();
    }

    if (this.pendingGatewayFunding) {
      return this.pendingGatewayFunding;
    }

    this.pendingGatewayFunding = this.doFundGateway(walletAddress)
      .then(() => {
        this.lastGatewayCheckAt = Date.now();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Signal Agent: Gateway self-funding failed: ${msg}`);
      })
      .finally(() => {
        this.pendingGatewayFunding = null;
      });

    return this.pendingGatewayFunding;
  }

  private async doFundGateway(walletAddress: string): Promise<void> {
    const pk = process.env.SIGNAL_AGENT_PRIVATE_KEY;

    if (!pk) {
      throw new Error("SIGNAL_AGENT_PRIVATE_KEY is not set");
    }

    const rpcUrl = process.env.ARC_TESTNET_RPC_URL?.trim() ?? "https://rpc.testnet.arc.network";
    const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: pk as `0x${string}`, rpcUrl });
    const balances = await gateway.getBalances(getAddress(walletAddress));
    const available = parseFloat(balances.gateway.formattedAvailable ?? "0");

    this.logger.log(`Signal Agent: Circle wallet Gateway USDC: ${available} (addr=${walletAddress})`);

    if (available >= this.GATEWAY_MIN_USDC) {
      return;
    }

    this.logger.log(
      `Signal Agent: depositing ${this.GATEWAY_DEPOSIT_USDC} USDC into Gateway for Circle wallet...`,
    );

    const result = await gateway.depositFor(
      this.GATEWAY_DEPOSIT_USDC,
      getAddress(walletAddress),
    );

    this.logger.log(`Signal Agent: Gateway deposit complete. tx=${result.depositTxHash}`);
  }

  private buildInternalUrl(path: string) {
    const origin =
      process.env.INTERNAL_API_ORIGIN?.trim() ||
      `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
    return `${origin}/api${path.startsWith("/") ? path : `/${path}`}`;
  }
}

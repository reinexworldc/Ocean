import { BadRequestException, Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  isAddress,
  parseAbi,
  parseAbiItem,
  zeroAddress,
} from "viem";
import { arcHttpTransport, getArcTestnetRpcUrl } from "../../common/rpc/arc-rpc.transport.js";

const LOG_BLOCK_RANGE = 10_000n;

type HistoryPeriod = "1h" | "24h" | "7d" | "30d";

type TokenHistoryPoint = {
  timestamp: string;
  price: number;
  volume: number;
};

type TokenSnapshot = {
  symbol: string;
  name: string;
  address: string;
  description: string;
  totalSupply: number;
  decimals: number;
  launchDate: string;
  current: {
    price: number;
    marketCap: number;
    volume24h: number;
    change1h: number;
    change24h: number;
    change7d: number;
    holders: number;
    liquidity: number;
  };
  history: Record<HistoryPeriod, TokenHistoryPoint[]>;
  sentiment: string;
  analysis: string;
};

type TokenDataset = {
  tokens: Record<string, TokenSnapshot>;
  market?: {
    updatedAt?: string;
  };
};

type PortfolioPosition = {
  id: string;
  symbol: string;
  name: string;
  address: string;
  sentiment: string;
  balance: {
    raw: string;
    formatted: string;
    amount: number;
  };
  allocation: number;
  currentPrice: number;
  currentValueUsd: number;
  averageEntryPriceUsd: number | null;
  costBasisUsd: number | null;
  pnl: {
    unrealizedUsd: number | null;
    unrealizedPct: number | null;
  };
  exposure: {
    usd: number;
    weight: number;
  };
  lastActivityAt: string | null;
  transfersCount: number;
  metrics: {
    marketCap: number;
    liquidity: number;
    volume24h: number;
    change24h: number;
    change7d: number;
  };
};

type WalletTransferEvent = {
  timestampMs: number;
  quantity: number;
};

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

@Injectable()
export class PortfolioService {
  private readonly publicClient = createPublicClient({
    transport: arcHttpTransport(getArcTestnetRpcUrl()),
  });

  async getWalletPortfolio(walletAddress: string) {
    if (!isAddress(walletAddress)) {
      throw new BadRequestException(`Wallet "${walletAddress}" is not a valid address.`);
    }

    const normalizedWalletAddress = getAddress(walletAddress);
    const dataset = await this.readTokenDataset();
    const trackedTokens = Object.values(dataset.tokens);
    const trackedPositions = await Promise.all(
      trackedTokens.map((token) => this.buildTrackedPosition(token, normalizedWalletAddress)),
    );
    const positions = trackedPositions
      .filter((position) => position !== null)
      .sort((left, right) => right.currentValueUsd - left.currentValueUsd);
    const totalValueUsd = this.round(
      positions.reduce((total, position) => total + position.currentValueUsd, 0),
    );
    const totalCostBasisUsd = this.round(
      positions.reduce((total, position) => total + (position.costBasisUsd ?? 0), 0),
    );
    const hasPnlCoverage = positions.every((position) => position.costBasisUsd !== null);
    const totalUnrealizedPnlUsd = hasPnlCoverage ? this.round(totalValueUsd - totalCostBasisUsd) : null;
    const totalUnrealizedPnlPct =
      hasPnlCoverage && totalCostBasisUsd > 0
        ? this.round((totalUnrealizedPnlUsd! / totalCostBasisUsd) * 100)
        : null;

    const positionsWithAllocation = positions.map((position) => {
      const allocation = totalValueUsd === 0 ? 0 : this.round((position.currentValueUsd / totalValueUsd) * 100);

      return {
        ...position,
        allocation,
        exposure: {
          usd: position.currentValueUsd,
          weight: allocation,
        },
      };
    });

    return {
      wallet: normalizedWalletAddress,
      network: "Arc Testnet",
      updatedAt: dataset.market?.updatedAt ?? new Date().toISOString(),
      methodology: {
        balancesSource: "on-chain",
        pricingSource: "tokens.json snapshots",
        pnlMethod: "estimated from wallet transfer flow matched to nearest historical price point",
      },
      summary: {
        trackedTokens: trackedTokens.length,
        currentPositions: positionsWithAllocation.length,
        totalValueUsd,
        totalCostBasisUsd: hasPnlCoverage ? totalCostBasisUsd : null,
        unrealizedExposureUsd: totalValueUsd,
        pnl: {
          unrealizedUsd: totalUnrealizedPnlUsd,
          unrealizedPct: totalUnrealizedPnlPct,
        },
        concentrationRisk: this.getConcentrationRisk(positionsWithAllocation),
      },
      allocation: positionsWithAllocation.map((position) => ({
        symbol: position.symbol,
        name: position.name,
        valueUsd: position.currentValueUsd,
        weight: position.allocation,
      })),
      positions: positionsWithAllocation,
    };
  }

  private async buildTrackedPosition(
    token: TokenSnapshot,
    walletAddress: `0x${string}`,
  ): Promise<PortfolioPosition | null> {
    const [rawBalance, transferLogs] = await Promise.all([
      this.getTokenBalance(getAddress(token.address), walletAddress),
      this.getTransferLogs(getAddress(token.address)),
    ]);

    if (rawBalance === 0n) {
      return null;
    }

    const balanceAmount = Number(formatUnits(rawBalance, token.decimals));
    const currentValueUsd = this.round(balanceAmount * token.current.price);
    const walletTransferLogs = transferLogs.filter((log) => {
      const from = log.args.from ? getAddress(log.args.from) : null;
      const to = log.args.to ? getAddress(log.args.to) : null;

      return from === walletAddress || to === walletAddress;
    });
    const blockTimestamps = await this.getBlockTimestampsByNumber(walletTransferLogs);
    const walletEvents = this.toWalletTransferEvents(
      walletTransferLogs,
      walletAddress,
      token.decimals,
      blockTimestamps,
    );
    const costBasis = this.estimateCostBasis(walletEvents, token.history, balanceAmount);
    const averageEntryPriceUsd =
      costBasis.quantity > 0 && costBasis.costBasisUsd !== null
        ? this.round(costBasis.costBasisUsd / costBasis.quantity)
        : null;
    const unrealizedPnlUsd =
      costBasis.costBasisUsd !== null ? this.round(currentValueUsd - costBasis.costBasisUsd) : null;
    const unrealizedPnlPct =
      unrealizedPnlUsd !== null && costBasis.costBasisUsd && costBasis.costBasisUsd > 0
        ? this.round((unrealizedPnlUsd / costBasis.costBasisUsd) * 100)
        : null;

    return {
      id: token.symbol,
      symbol: token.symbol,
      name: token.name,
      address: getAddress(token.address),
      sentiment: token.sentiment,
      balance: {
        raw: rawBalance.toString(),
        formatted: formatUnits(rawBalance, token.decimals),
        amount: this.round(balanceAmount),
      },
      allocation: 0,
      currentPrice: token.current.price,
      currentValueUsd,
      averageEntryPriceUsd,
      costBasisUsd: costBasis.costBasisUsd,
      pnl: {
        unrealizedUsd: unrealizedPnlUsd,
        unrealizedPct: unrealizedPnlPct,
      },
      exposure: {
        usd: currentValueUsd,
        weight: 0,
      },
      lastActivityAt: this.getLastActivityTimestamp(walletTransferLogs, blockTimestamps),
      transfersCount: walletTransferLogs.length,
      metrics: {
        marketCap: token.current.marketCap,
        liquidity: token.current.liquidity,
        volume24h: token.current.volume24h,
        change24h: token.current.change24h,
        change7d: token.current.change7d,
      },
    };
  }

  private async readTokenDataset(): Promise<TokenDataset> {
    const filePath = join(process.cwd(), "tokens.json");
    const fileContents = await readFile(filePath, "utf8");

    return JSON.parse(fileContents) as TokenDataset;
  }

  private async getTokenBalance(tokenAddress: `0x${string}`, walletAddress: `0x${string}`) {
    return this.publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    });
  }

  private async getTransferLogs(address: `0x${string}`) {
    const latestBlock = await this.publicClient.getBlockNumber();
    const deploymentBlock = await this.findDeploymentBlock(address, latestBlock);
    const logs = [];

    for (
      let fromBlock = deploymentBlock;
      fromBlock <= latestBlock;
      fromBlock += LOG_BLOCK_RANGE
    ) {
      const toBlock =
        fromBlock + LOG_BLOCK_RANGE - 1n > latestBlock
          ? latestBlock
          : fromBlock + LOG_BLOCK_RANGE - 1n;

      const batchLogs = await this.publicClient.getLogs({
        address,
        event: transferEvent,
        fromBlock,
        toBlock,
      });

      logs.push(...batchLogs);
    }

    return logs;
  }

  private async findDeploymentBlock(
    address: `0x${string}`,
    latestBlock: bigint,
  ): Promise<bigint> {
    let low = 0n;
    let high = latestBlock;

    while (low < high) {
      const mid = low + (high - low) / 2n;
      const code = await this.publicClient.getCode({
        address,
        blockNumber: mid,
      });

      if (code && code !== "0x") {
        high = mid;
      } else {
        low = mid + 1n;
      }
    }

    return low;
  }

  private async getBlockTimestampsByNumber(
    transferLogs: Awaited<ReturnType<PortfolioService["getTransferLogs"]>>,
  ) {
    const blockNumbers = [
      ...new Set(transferLogs.flatMap((log) => (log.blockNumber === null ? [] : [log.blockNumber]))),
    ];
    const blocks = await Promise.all(
      blockNumbers.map(async (blockNumber) => ({
        blockNumber,
        timestampMs: Number(
          (
            await this.publicClient.getBlock({
              blockNumber,
            })
          ).timestamp * 1000n,
        ),
      })),
    );

    return new Map(blocks.map(({ blockNumber, timestampMs }) => [blockNumber, timestampMs]));
  }

  private toWalletTransferEvents(
    transferLogs: Awaited<ReturnType<PortfolioService["getTransferLogs"]>>,
    walletAddress: `0x${string}`,
    decimals: number,
    blockTimestamps: Map<bigint, number>,
  ): WalletTransferEvent[] {
    return transferLogs
      .flatMap((log) => {
        const blockNumber = log.blockNumber;

        if (blockNumber === null || blockNumber === undefined) {
          return [];
        }

        const timestampMs = blockTimestamps.get(blockNumber);

        if (timestampMs === undefined) {
          return [];
        }

        const from = log.args.from ? getAddress(log.args.from) : null;
        const to = log.args.to ? getAddress(log.args.to) : null;
        const quantity = Number(formatUnits(log.args.value ?? 0n, decimals));

        if (quantity === 0) {
          return [];
        }

        if (to === walletAddress) {
          return [{ timestampMs, quantity }];
        }

        if (from === walletAddress) {
          return [{ timestampMs, quantity: -quantity }];
        }

        return [];
      })
      .sort((left, right) => left.timestampMs - right.timestampMs);
  }

  private estimateCostBasis(
    walletEvents: WalletTransferEvent[],
    history: TokenSnapshot["history"],
    currentBalance: number,
  ) {
    if (walletEvents.length === 0) {
      return {
        quantity: currentBalance,
        costBasisUsd: currentBalance === 0 ? 0 : null,
      };
    }

    let runningQuantity = 0;
    let runningCostBasisUsd = 0;

    for (const event of walletEvents) {
      if (event.quantity > 0) {
        const entryPrice = this.resolveHistoricalPrice(history, event.timestampMs);

        runningQuantity += event.quantity;
        runningCostBasisUsd += event.quantity * entryPrice;
        continue;
      }

      const quantityToClose = Math.min(Math.abs(event.quantity), runningQuantity);

      if (quantityToClose === 0 || runningQuantity === 0) {
        continue;
      }

      const averageCost = runningCostBasisUsd / runningQuantity;

      runningQuantity -= quantityToClose;
      runningCostBasisUsd -= quantityToClose * averageCost;
    }

    if (currentBalance === 0) {
      return {
        quantity: 0,
        costBasisUsd: 0,
      };
    }

    if (runningQuantity <= 0 || runningCostBasisUsd <= 0) {
      return {
        quantity: currentBalance,
        costBasisUsd: null,
      };
    }

    const averageCost = runningCostBasisUsd / runningQuantity;

    return {
      quantity: currentBalance,
      costBasisUsd: this.round(currentBalance * averageCost),
    };
  }

  private resolveHistoricalPrice(history: TokenSnapshot["history"], timestampMs: number) {
    const allPoints = [...history["30d"], ...history["7d"], ...history["24h"], ...history["1h"]].sort(
      (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
    );

    if (allPoints.length === 0) {
      return 0;
    }

    let nearestPoint = allPoints[0]!;
    let smallestDistance = Math.abs(new Date(nearestPoint.timestamp).getTime() - timestampMs);

    for (const point of allPoints.slice(1)) {
      const distance = Math.abs(new Date(point.timestamp).getTime() - timestampMs);

      if (distance < smallestDistance) {
        nearestPoint = point;
        smallestDistance = distance;
      }
    }

    return nearestPoint.price;
  }

  private getLastActivityTimestamp(
    transferLogs: Awaited<ReturnType<PortfolioService["getTransferLogs"]>>,
    blockTimestamps: Map<bigint, number>,
  ) {
    const latestBlockNumber = transferLogs.reduce<bigint | null>((latest, log) => {
      if (log.blockNumber === null || log.blockNumber === undefined) {
        return latest;
      }

      if (latest === null || log.blockNumber > latest) {
        return log.blockNumber;
      }

      return latest;
    }, null);

    if (latestBlockNumber === null) {
      return null;
    }

    const latestTimestampMs = blockTimestamps.get(latestBlockNumber);

    return latestTimestampMs ? new Date(latestTimestampMs).toISOString() : null;
  }

  private getConcentrationRisk(positions: PortfolioPosition[]) {
    if (positions.length === 0) {
      return {
        level: "low",
        largestPositionWeight: 0,
        top3Weight: 0,
        hhi: 0,
      };
    }

    const weights = positions.map((position) => position.allocation / 100);
    const largestPositionWeight = this.round(Math.max(...weights) * 100);
    const top3Weight = this.round(
      [...weights]
        .sort((left, right) => right - left)
        .slice(0, 3)
        .reduce((total, weight) => total + weight, 0) * 100,
    );
    const hhi = this.round(weights.reduce((total, weight) => total + weight * weight, 0));

    return {
      level:
        largestPositionWeight >= 60 || hhi >= 0.45
          ? "high"
          : largestPositionWeight >= 35 || hhi >= 0.25
            ? "medium"
            : "low",
      largestPositionWeight,
      top3Weight,
      hhi,
    };
  }

  private round(value: number) {
    return Number(value.toFixed(2));
  }
}

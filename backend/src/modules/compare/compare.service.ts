import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CoinGeckoService } from "./coingecko.service.js";

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
  sentiment: string;
  analysis: string;
};

type TokenDataset = { tokens: Record<string, TokenSnapshot> };

export type CompareResult = {
  arcToken: {
    id: string;
    symbol: string;
    name: string;
    network: "Arc Testnet";
    address: string;
    price: number;
    change24h: number;
    change7d: number;
    volume24h: number;
    marketCap: number;
    holders: number;
    liquidity: number;
    sentiment: string;
    analysis: string;
  };
  externalToken: {
    id: string;
    symbol: string;
    name: string;
    source: "CoinGecko";
    price: number;
    change24h: number;
    change7d: number | null;
    change30d: number | null;
    volume24h: number;
    marketCap: number;
    allTimeHigh: number;
    allTimeHighChangePercent: number | null;
    circulatingSupply: number | null;
  };
  comparison: {
    /** How many arc-token units equal 1 external token. */
    priceRatioArcPerExternal: number | null;
    /** arcToken.change24h − externalToken.change24h */
    outperformance24h: number;
    /** arcToken.change7d − externalToken.change7d (null if no 7d data) */
    outperformance7d: number | null;
    arcOutperforming24h: boolean;
    arcOutperforming7d: boolean | null;
    /** Ratio of arc volume to external volume (null if external is 0) */
    volumeRatio: number | null;
  };
};

@Injectable()
export class CompareService {
  private readonly logger = new Logger(CompareService.name);

  constructor(
    @Inject(CoinGeckoService)
    private readonly coinGeckoService: CoinGeckoService,
  ) {}

  async compare(arcTokenId: string, externalCoinRaw: string): Promise<CompareResult> {
    const normalized = arcTokenId.trim().toUpperCase();
    const dataset = await this.readTokenDataset();
    const arc = dataset.tokens[normalized];

    if (!arc) {
      const available = Object.keys(dataset.tokens).join(", ");
      throw new NotFoundException(
        `Arc token "${arcTokenId}" was not found. Available: ${available}.`,
      );
    }

    const coinId = this.coinGeckoService.resolveId(externalCoinRaw);
    this.logger.log(`Comparing Arc:${normalized} vs CoinGecko:${coinId}`);

    const ext = await this.coinGeckoService.getCoinData(coinId);

    const priceRatioArcPerExternal =
      arc.current.price > 0 && ext.price > 0 ? ext.price / arc.current.price : null;

    const outperformance24h = arc.current.change24h - ext.change24h;
    const outperformance7d = ext.change7d !== null ? arc.current.change7d - ext.change7d : null;

    const volumeRatio =
      ext.volume24h > 0 ? arc.current.volume24h / ext.volume24h : null;

    return {
      arcToken: {
        id: arc.symbol,
        symbol: arc.symbol,
        name: arc.name,
        network: "Arc Testnet",
        address: arc.address,
        price: arc.current.price,
        change24h: arc.current.change24h,
        change7d: arc.current.change7d,
        volume24h: arc.current.volume24h,
        marketCap: arc.current.marketCap,
        holders: arc.current.holders,
        liquidity: arc.current.liquidity,
        sentiment: arc.sentiment,
        analysis: arc.analysis,
      },
      externalToken: {
        id: ext.id,
        symbol: ext.symbol,
        name: ext.name,
        source: "CoinGecko",
        price: ext.price,
        change24h: ext.change24h,
        change7d: ext.change7d,
        change30d: ext.change30d,
        volume24h: ext.volume24h,
        marketCap: ext.marketCap,
        allTimeHigh: ext.allTimeHigh,
        allTimeHighChangePercent: ext.allTimeHighChangePercent,
        circulatingSupply: ext.circulatingSupply,
      },
      comparison: {
        priceRatioArcPerExternal,
        outperformance24h: Math.round(outperformance24h * 100) / 100,
        outperformance7d: outperformance7d !== null ? Math.round(outperformance7d * 100) / 100 : null,
        arcOutperforming24h: outperformance24h > 0,
        arcOutperforming7d: outperformance7d !== null ? outperformance7d > 0 : null,
        volumeRatio: volumeRatio !== null ? Math.round(volumeRatio * 1e6) / 1e6 : null,
      },
    };
  }

  private async readTokenDataset(): Promise<TokenDataset> {
    const filePath = join(process.cwd(), "tokens.json");
    const contents = await readFile(filePath, "utf8");
    return JSON.parse(contents) as TokenDataset;
  }
}

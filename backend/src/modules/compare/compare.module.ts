import { Module } from "@nestjs/common";
import { CoinGeckoService } from "./coingecko.service.js";
import { CompareController } from "./compare.controller.js";
import { CompareService } from "./compare.service.js";

@Module({
  controllers: [CompareController],
  providers: [CoinGeckoService, CompareService],
})
export class CompareModule {}

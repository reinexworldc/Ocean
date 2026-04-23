import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module.js";
import { X402Module } from "./common/x402/x402.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { ChatsModule } from "./modules/chats/chats.module.js";
import { CircleWalletModule } from "./modules/circle-wallet/circle-wallet.module.js";
import { MarketModule } from "./modules/market/market.module.js";
import { PaymentsModule } from "./modules/payments/payments.module.js";
import { PortfolioModule } from "./modules/portfolio/portfolio.module.js";
import { TokenModule } from "./modules/token/token.module.js";
import { TradeModule } from "./modules/trade/trade.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { SignalsModule } from "./modules/signals/signals.module.js";
import { CompareModule } from "./modules/compare/compare.module.js";

@Module({
  imports: [
    PrismaModule,
    X402Module,
    HealthModule,
    AuthModule,
    ChatsModule,
    CircleWalletModule,
    PaymentsModule,
    UsersModule,
    TokenModule,
    MarketModule,
    PortfolioModule,
    TradeModule,
    SignalsModule,
    CompareModule,
  ],
})
export class AppModule {}

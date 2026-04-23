import { Module } from "@nestjs/common";
import { CircleWalletModule } from "../circle-wallet/circle-wallet.module.js";
import { SignalsController } from "./signals.controller.js";
import { SignalsService } from "./signals.service.js";

@Module({
  imports: [CircleWalletModule],
  controllers: [SignalsController],
  providers: [SignalsService],
})
export class SignalsModule {}

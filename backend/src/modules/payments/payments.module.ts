import { Module } from "@nestjs/common";
import { CircleWalletModule } from "../circle-wallet/circle-wallet.module.js";
import { PaymentsService } from "./payments.service.js";

@Module({
  imports: [CircleWalletModule],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}

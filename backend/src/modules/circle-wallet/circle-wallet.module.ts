import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CircleWalletController } from "./circle-wallet.controller.js";
import { CircleWalletService } from "./circle-wallet.service.js";

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [CircleWalletController],
  providers: [CircleWalletService],
  exports: [CircleWalletService],
})
export class CircleWalletModule {}

import { BadRequestException, Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { RequireX402 } from "../../common/x402/require-x402.decorator.js";
import { x402RouteConfigs } from "../../common/x402/x402-route-configs.js";
import { CompareService } from "./compare.service.js";

@Controller("compare")
export class CompareController {
  constructor(@Inject(CompareService) private readonly compareService: CompareService) {}

  /**
   * Compare an Arc ecosystem token against any major market coin via CoinGecko.
   * Protected by x402 — costs $0.02 USDC per call.
   *
   * Example: GET /compare/MOON?vs=bitcoin
   */
  @Get(":arcTokenId")
  @RequireX402(x402RouteConfigs.getComparison)
  getComparison(
    @Param("arcTokenId") arcTokenId: string,
    @Query("vs") vs: string | undefined,
  ) {
    if (!vs?.trim()) {
      throw new BadRequestException(
        'Missing query parameter "vs". Example: ?vs=bitcoin',
      );
    }

    return this.compareService.compare(arcTokenId, vs.trim());
  }
}

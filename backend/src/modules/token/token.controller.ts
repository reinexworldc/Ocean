import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { x402RouteConfigs } from "../../common/x402/x402-route-configs.js";
import { RequireX402 } from "../../common/x402/require-x402.decorator.js";
import { type GetTokenHistoryQueryDto } from "./dto/get-token-history-query.dto.js";
import { TokenService } from "./token.service.js";

@Controller("token")
export class TokenController {
  constructor(@Inject(TokenService) private readonly tokenService: TokenService) {}

  /**
   * Returns the main token card with market data and status.
   */
  @Get(":id")
  @RequireX402(x402RouteConfigs.getTokenById)
  getTokenById(@Param("id") tokenId: string) {
    return this.tokenService.getTokenById(tokenId);
  }

  /**
   * Granular paid endpoints for agent/debug UI.
   */
  @Get(":id/profile")
  @RequireX402(x402RouteConfigs.getTokenProfile)
  getTokenProfile(@Param("id") tokenId: string) {
    return this.tokenService.getTokenProfile(tokenId);
  }

  @Get(":id/erc20")
  @RequireX402(x402RouteConfigs.getTokenErc20)
  getTokenErc20(@Param("id") tokenId: string) {
    return this.tokenService.getTokenErc20(tokenId);
  }

  @Get(":id/transfers")
  @RequireX402(x402RouteConfigs.getTokenTransfers)
  getTokenTransfers(@Param("id") tokenId: string) {
    return this.tokenService.getTokenTransfers(tokenId);
  }

  @Get(":id/holders")
  @RequireX402(x402RouteConfigs.getTokenHolders)
  getTokenHolders(@Param("id") tokenId: string) {
    return this.tokenService.getTokenHolders(tokenId);
  }

  /**
   * Returns price history for the requested period.
   */
  @Get(":id/history")
  @RequireX402(x402RouteConfigs.getTokenHistory)
  getTokenHistory(
    @Param("id") tokenId: string,
    @Query() query: GetTokenHistoryQueryDto,
  ) {
    return this.tokenService.getTokenHistory(tokenId, query);
  }
}

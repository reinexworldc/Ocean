import { Controller, Get, Inject, Param } from "@nestjs/common";
import { RequireX402 } from "../../common/x402/require-x402.decorator.js";
import { x402RouteConfigs } from "../../common/x402/x402-route-configs.js";
import { SignalsService } from "./signals.service.js";

@Controller("signals")
export class SignalsController {
  constructor(@Inject(SignalsService) private readonly signalsService: SignalsService) {}

  /**
   * x402-gated Signal Agent endpoint.
   *
   * Caller pays $0.005 to SIGNAL_AGENT_RECEIVER_ADDRESS.
   * Internally the Signal Agent pays $0.01 to the main API to fetch
   * /token/:tokenId/profile, completing the three-level A2A payment chain:
   *   user → Ocean Agent → Signal Agent → Token RPC API.
   */
  @Get(":tokenId")
  @RequireX402(x402RouteConfigs.getSignal)
  getSignal(@Param("tokenId") tokenId: string) {
    return this.signalsService.getSignal(tokenId);
  }
}

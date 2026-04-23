import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { X402_CHARGE_METADATA_KEY } from "./x402.constants.js";
import { X402Service } from "./x402.service.js";
import { type X402ChargeOptions } from "./x402.types.js";

type NextFunction = (error?: unknown) => void;

@Injectable()
export class X402PaymentGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(X402Service) private readonly x402Service: X402Service,
  ) {}

  async canActivate(context: ExecutionContext) {
    const charge = this.reflector.getAllAndOverride<X402ChargeOptions>(
      X402_CHARGE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!charge) {
      return true;
    }

    await this.x402Service.ensureInitialized();

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Resolve dynamic price if a PriceFn was provided instead of a static string.
    const resolvedPrice =
      typeof charge.price === "function"
        ? await charge.price(request as Record<string, unknown>)
        : charge.price;

    const resolvedCharge: X402ChargeOptions = { ...charge, price: resolvedPrice };
    const middleware = this.x402Service.createRouteMiddleware(request, resolvedCharge);

    await new Promise<void>((resolve, reject) => {
      const next: NextFunction = (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      void middleware(request, response, next);
    });

    return !(response.headersSent || response.writableEnded);
  }
}

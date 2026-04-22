import { randomUUID } from "node:crypto";
import {
  BadGatewayException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { createPublicClient, http } from "viem";
import { Prisma } from "../../generated/prisma/client.js";
import { TransactionProvider, TransactionStatus } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { DEFAULT_X402_NETWORK } from "../../common/x402/x402.constants.js";
import { CircleWalletService } from "../circle-wallet/circle-wallet.service.js";
import { createCircleWalletClient } from "../circle-wallet/circle-wallet.client.js";

const DEFAULT_ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network";

type HttpMethod = "GET" | "POST";

type JsonRecord = Record<string, unknown>;

export type PaidApiRequestInput = {
  userId: string;
  chatId?: string;
  actionType: string;
  amountUsd: string;
  description: string;
  method: HttpMethod;
  path: string;
  body?: JsonRecord;
};

export type PaidApiRequestResult<T> = {
  data: T;
  transactionId: string;
  settlementTransaction: string;
  paymentNetwork: string;
};

@Injectable()
export class PaymentsService {
  private readonly publicClient = createPublicClient({
    transport: http(process.env.ARC_TESTNET_RPC_URL ?? DEFAULT_ARC_TESTNET_RPC_URL),
  });

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CircleWalletService) private readonly circleWalletService: CircleWalletService,
  ) {}

  async callPaidJsonEndpoint<T>(input: PaidApiRequestInput): Promise<PaidApiRequestResult<T>> {
    const user = await this.ensureChargeableUser(input.userId);
    const requestUrl = this.buildInternalApiUrl(input.path);
    const unsignedResponse = await fetch(requestUrl, {
      method: input.method,
      headers: this.buildRequestHeaders(input.body),
      body: input.body ? JSON.stringify(input.body) : undefined,
    });

    if (unsignedResponse.status !== 402) {
      const responseBody = await this.readResponseBody(unsignedResponse);

      throw new InternalServerErrorException(
        `Expected x402 challenge for ${input.method} ${input.path}, but received ${unsignedResponse.status}. ${responseBody}`,
      );
    }

    const x402HttpClient = new x402HTTPClient(
      new x402Client().register(
        DEFAULT_X402_NETWORK,
        new ExactEvmScheme(await this.createCircleSigner(user.circleWalletId!, user.circleWalletAddress!)),
      ),
    );
    const paymentRequired = x402HttpClient.getPaymentRequiredResponse((name) =>
      unsignedResponse.headers.get(name),
    );
    const pendingTransaction = await this.prisma.transaction.create({
      data: {
        userId: input.userId,
        chatId: input.chatId,
        walletAddress: user.circleWalletAddress!,
        amountUsd: this.toDecimalAmount(input.amountUsd),
        currency: "USDC",
        provider: TransactionProvider.X402,
        externalPaymentId: randomUUID(),
        status: TransactionStatus.PENDING,
        metadata: this.toMetadataValue({
          kind: "X402_AGENT_TOOL_CALL",
          actionType: input.actionType,
          description: input.description,
          request: {
            method: input.method,
            path: input.path,
            url: requestUrl,
          },
          paymentRequired,
        }),
      },
    });

    let settlementResult: { success: boolean } | null = null;

    try {
      const paymentPayload = await x402HttpClient.createPaymentPayload(paymentRequired);
      const paidResponse = await fetch(requestUrl, {
        method: input.method,
        headers: {
          ...this.buildRequestHeaders(input.body),
          ...x402HttpClient.encodePaymentSignatureHeader(paymentPayload),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      });
      const settlement = x402HttpClient.getPaymentSettleResponse((name) => paidResponse.headers.get(name));
      const rawPaidBody = await paidResponse.text();
      settlementResult = settlement;

      await this.prisma.transaction.update({
        where: {
          id: pendingTransaction.id,
        },
        data: {
          status: settlement.success ? TransactionStatus.COMPLETED : TransactionStatus.FAILED,
          externalPaymentId: settlement.transaction || pendingTransaction.externalPaymentId,
          metadata: this.toMetadataValue({
            kind: "X402_AGENT_TOOL_CALL",
            actionType: input.actionType,
            description: input.description,
            request: {
              method: input.method,
              path: input.path,
              url: requestUrl,
            },
            paymentRequired,
            settlement,
            response: {
              ok: paidResponse.ok,
              status: paidResponse.status,
            },
          }),
        },
      });

      if (!settlement.success) {
        throw new BadGatewayException(
          settlement.errorMessage || `x402 settlement failed for ${input.method} ${input.path}.`,
        );
      }

      if (!paidResponse.ok) {
        throw new BadGatewayException(
          `Paid request failed for ${input.method} ${input.path} with status ${paidResponse.status}.`,
        );
      }

      return {
        data: this.parseJsonBody<T>(rawPaidBody),
        transactionId: pendingTransaction.id,
        settlementTransaction: settlement.transaction,
        paymentNetwork: settlement.network,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown x402 payment error.";

      if (!settlementResult?.success) {
        await this.prisma.transaction.update({
          where: {
            id: pendingTransaction.id,
          },
          data: {
            status: TransactionStatus.FAILED,
            metadata: this.toMetadataValue({
              kind: "X402_AGENT_TOOL_CALL",
              actionType: input.actionType,
              description: input.description,
              request: {
                method: input.method,
                path: input.path,
                url: requestUrl,
              },
              paymentRequired,
              error: errorMessage,
            }),
          },
        });
      }

      throw error;
    }
  }

  private async ensureChargeableUser(userId: string) {
    await this.circleWalletService.ensureWalletAndFundingForUser(userId);

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new NotFoundException("User was not found.");
    }

    if (!user.circleWalletId || !user.circleWalletAddress) {
      throw new InternalServerErrorException("The user does not have a chargeable Circle wallet.");
    }

    return user;
  }

  private async createCircleSigner(circleWalletId: string, circleWalletAddress: string) {
    const circleClient = await createCircleWalletClient();

    return toClientEvmSigner(
      {
        address: circleWalletAddress as `0x${string}`,
        signTypedData: async ({ domain, types, primaryType, message }) => {
          const response = await circleClient.signTypedData({
            walletId: circleWalletId,
            data: JSON.stringify({
              domain,
              types,
              primaryType,
              message,
            }),
            memo: "Ocean x402 premium API payment",
          });
          const signature = response.data?.signature;

          if (!signature) {
            throw new InternalServerErrorException("Circle did not return an EIP-712 signature.");
          }

          return signature as `0x${string}`;
        },
      },
      this.publicClient,
    );
  }

  private buildInternalApiUrl(path: string) {
    const origin = process.env.INTERNAL_API_ORIGIN?.trim() || `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
    return `${origin}/api${path.startsWith("/") ? path : `/${path}`}`;
  }

  private buildRequestHeaders(body?: JsonRecord) {
    return {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    };
  }

  private parseJsonBody<T>(rawBody: string) {
    if (!rawBody) {
      throw new BadGatewayException("Paid endpoint returned an empty response body.");
    }

    try {
      return JSON.parse(rawBody) as T;
    } catch {
      throw new BadGatewayException("Paid endpoint returned a non-JSON response.");
    }
  }

  private async readResponseBody(response: Response) {
    const rawBody = await response.text();
    return rawBody.trim().slice(0, 500);
  }

  private toDecimalAmount(priceUsd: string) {
    return priceUsd.replace(/^\$/u, "");
  }

  private toMetadataValue(value: Record<string, unknown>): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}

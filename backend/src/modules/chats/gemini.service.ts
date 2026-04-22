import { GoogleGenAI } from "@google/genai";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { HISTORY_PERIODS, type HistoryPeriod } from "../payments/paid-api-catalog.js";

const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

export type GeminiChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type PlannedPremiumAction =
  | {
      type: "get_market_overview";
    }
  | {
      type: "get_token_details";
      tokenId: string;
    }
  | {
      type: "get_token_history";
      tokenId: string;
      period: HistoryPeriod;
    }
  | {
      type: "get_wallet_portfolio";
    };

@Injectable()
export class GeminiService {
  private client: GoogleGenAI | null = null;

  async generateReply(messages: GeminiChatMessage[]) {
    const text = await this.generateText(this.buildReplyPrompt(messages));

    if (!text) {
      throw new ServiceUnavailableException("Gemini returned an empty response.");
    }

    return text;
  }

  async generateReplyWithToolResults(params: {
    messages: GeminiChatMessage[];
    toolResults: Array<Record<string, unknown>>;
  }) {
    const text = await this.generateText(this.buildToolReplyPrompt(params.messages, params.toolResults));

    if (!text) {
      throw new ServiceUnavailableException("Gemini returned an empty orchestrated response.");
    }

    return text;
  }

  async planPremiumActions(params: {
    latestUserMessage: string;
    circleWalletAddress: string | null;
  }): Promise<PlannedPremiumAction[]> {
    const rawPlan = await this.generateText(
      this.buildPlanningPrompt(params.latestUserMessage, params.circleWalletAddress),
    );
    const parsedPlan = this.parseJsonObject(rawPlan);
    const actions = Array.isArray(parsedPlan.actions) ? parsedPlan.actions : [];

    return this.normalizePlannedActions(actions);
  }

  private getClient() {
    if (this.client) {
      return this.client;
    }

    const apiKey = process.env.GOOGLE_API_KEY?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException("GOOGLE_API_KEY is not configured.");
    }

    this.client = new GoogleGenAI({
      apiKey,
    });

    return this.client;
  }

  private getModel() {
    return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  }

  private async generateText(prompt: string) {
    const response = await this.getClient().models.generateContent({
      model: this.getModel(),
      contents: prompt,
    });

    return response.text?.trim();
  }

  private buildReplyPrompt(messages: GeminiChatMessage[]) {
    const transcript = messages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n\n");

    return [
      "You are Ocean, a concise and helpful AI chat assistant.",
      "Continue the conversation naturally and answer in plain text.",
      "Use the transcript below as the chat history.",
      transcript,
    ].join("\n\n");
  }

  private buildToolReplyPrompt(
    messages: GeminiChatMessage[],
    toolResults: Array<Record<string, unknown>>,
  ) {
    const transcript = messages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n\n");

    return [
      "You are Ocean, a concise and helpful crypto research assistant.",
      "You are an orchestrator that calls premium data tools and then synthesizes the final answer.",
      "Treat the premium tool results below as the source of truth for factual claims.",
      "Do not mention x402, payment plumbing, or internal implementation details unless the user asks.",
      "If the tool results are incomplete, be transparent about the gap.",
      "Respond in plain text.",
      `PREMIUM_TOOL_RESULTS_JSON:\n${this.safeJsonStringify(toolResults)}`,
      "CHAT_TRANSCRIPT:",
      transcript,
    ].join("\n\n");
  }

  private buildPlanningPrompt(latestUserMessage: string, circleWalletAddress: string | null) {
    return [
      "You are the Ocean premium tool planner.",
      "Decide whether the latest user message requires premium API calls.",
      'Return strict JSON only in the format {"actions":[...]} with no markdown fences.',
      "Available actions:",
      '1. {"type":"get_market_overview"} -> GET /market',
      '2. {"type":"get_token_details","tokenId":"SOL"} -> GET /token/:id',
      '3. {"type":"get_token_history","tokenId":"SOL","period":"24h"} -> GET /token/:id/history?period=24h',
      '4. {"type":"get_wallet_portfolio"} -> GET /portfolio/:wallet using the authenticated user Circle wallet',
      "Rules:",
      "- Return an empty actions array for greetings, casual chat, or requests that do not need premium data.",
      "- For token comparison, momentum, price, activity, sentiment, or relative-strength questions, include the needed market/token actions.",
      "- For momentum comparisons across tokens, include get_market_overview plus get_token_details and get_token_history for each compared token.",
      "- For portfolio or holdings questions, include get_wallet_portfolio if a Circle wallet exists.",
      `- Supported history periods: ${HISTORY_PERIODS.join(", ")}.`,
      "- Never duplicate the same action.",
      "- Use uppercase token ids.",
      `Authenticated user Circle wallet available: ${circleWalletAddress ? "yes" : "no"}.`,
      `Latest user message: ${latestUserMessage}`,
    ].join("\n\n");
  }

  private parseJsonObject(value: string | undefined) {
    if (!value) {
      return {};
    }

    const trimmed = value.trim();

    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/u);
      const candidate = fencedMatch?.[1] ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);

      try {
        return JSON.parse(candidate) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }

  private normalizePlannedActions(actions: unknown[]): PlannedPremiumAction[] {
    const dedupedActions = new Map<string, PlannedPremiumAction>();

    for (const rawAction of actions) {
      if (!rawAction || typeof rawAction !== "object" || Array.isArray(rawAction)) {
        continue;
      }

      const action = rawAction as Record<string, unknown>;
      const type = typeof action.type === "string" ? action.type : null;

      if (type === "get_market_overview") {
        dedupedActions.set(type, {
          type,
        });
        continue;
      }

      if (type === "get_wallet_portfolio") {
        dedupedActions.set(type, {
          type,
        });
        continue;
      }

      if (type === "get_token_details") {
        const tokenId = this.normalizeTokenId(action.tokenId);

        if (!tokenId) {
          continue;
        }

        dedupedActions.set(`${type}:${tokenId}`, {
          type,
          tokenId,
        });
        continue;
      }

      if (type === "get_token_history") {
        const tokenId = this.normalizeTokenId(action.tokenId);
        const period = this.normalizeHistoryPeriod(action.period);

        if (!tokenId || !period) {
          continue;
        }

        dedupedActions.set(`${type}:${tokenId}:${period}`, {
          type,
          tokenId,
          period,
        });
      }
    }

    return [...dedupedActions.values()].slice(0, 8);
  }

  private normalizeTokenId(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeHistoryPeriod(value: unknown): HistoryPeriod | null {
    return typeof value === "string" && HISTORY_PERIODS.includes(value as HistoryPeriod)
      ? (value as HistoryPeriod)
      : null;
  }

  private safeJsonStringify(value: unknown) {
    return JSON.stringify(
      value,
      (_key, currentValue) => (typeof currentValue === "bigint" ? currentValue.toString() : currentValue),
      2,
    );
  }
}

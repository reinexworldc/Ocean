import OpenAI from "openai";
import { Injectable, Logger } from "@nestjs/common";

/**
 * Maps internal Gemini model names to their OpenRouter equivalents.
 * Used when falling back from the Gemini API to OpenRouter.
 */
const OPENROUTER_MODEL_MAP: Record<string, string> = {
  "gemini-3-flash-preview": "google/gemini-flash-2.5",
  "gemini-2.0-flash": "google/gemini-2.0-flash-001",
  "gemini-1.5-flash": "google/gemini-1.5-flash",
};

const DEFAULT_OPENROUTER_MODEL = "google/gemini-flash-2.5";

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name);
  private client: OpenAI | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.OPENROUTER_API_KEY?.trim());
  }

  async generateText(prompt: string, geminiModel: string): Promise<string | undefined> {
    const model = this.resolveModel(geminiModel);
    this.logger.log(`OpenRouter fallback: using model ${model}`);

    const response = await this.getClient().chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0]?.message?.content?.trim() ?? undefined;
  }

  async *generateTextStream(prompt: string, geminiModel: string): AsyncGenerator<string> {
    const model = this.resolveModel(geminiModel);
    this.logger.log(`OpenRouter fallback (stream): using model ${model}`);

    const stream = await this.getClient().chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        yield text;
      }
    }
  }

  private resolveModel(geminiModel: string): string {
    const envModel = process.env.OPENROUTER_MODEL?.trim();
    if (envModel) return envModel;
    return OPENROUTER_MODEL_MAP[geminiModel] ?? DEFAULT_OPENROUTER_MODEL;
  }

  private getClient(): OpenAI {
    if (this.client) {
      return this.client;
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();

    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.APP_URL ?? "https://ocean.app",
        "X-Title": "Ocean",
      },
    });

    return this.client;
  }
}

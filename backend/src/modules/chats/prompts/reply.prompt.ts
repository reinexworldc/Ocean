import { type GeminiChatMessage } from "../gemini.service.js";

function buildTranscript(messages: GeminiChatMessage[]) {
  return messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
}

export function buildReplyPrompt(messages: GeminiChatMessage[]): string {
  return [
    "You are Ocean, a concise and helpful AI chat assistant.",
    "Continue the conversation naturally and answer in plain text.",
    "Use the transcript below as the chat history.",
    buildTranscript(messages),
  ].join("\n\n");
}

export type TradeProposalContext = {
  direction: "BUY" | "SELL";
  tokenSymbol: string;
  tokenAmount: number;
  priceUsdEach: number;
  totalValueUsd: number;
};

export function buildTradeProposalReplyPrompt(
  messages: GeminiChatMessage[],
  proposal: TradeProposalContext,
): string {
  const verb = proposal.direction === "BUY" ? "buy" : "sell";
  const proposalSummary = `A ${proposal.direction} proposal has been prepared: ${proposal.tokenAmount} ${proposal.tokenSymbol} at $${proposal.priceUsdEach.toFixed(4)} each (total $${proposal.totalValueUsd.toFixed(2)}).`;

  return [
    "You are Ocean, a concise and helpful AI crypto assistant.",
    `A trade proposal card is already displayed to the user in the UI — do NOT describe it again or repeat the numbers.`,
    `Context: ${proposalSummary}`,
    `Tell the user in 1-2 short sentences that their ${verb} proposal for ${proposal.tokenSymbol} is ready to review, and ask them to confirm or cancel it.`,
    "Respond in plain text only.",
    "CHAT_TRANSCRIPT:",
    buildTranscript(messages),
  ].join("\n\n");
}

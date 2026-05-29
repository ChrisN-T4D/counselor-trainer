import type OpenAI from "openai";

type AssistantMessage = OpenAI.Chat.Completions.ChatCompletionMessage & {
  reasoning?: string | null;
};

/** Only use speakable assistant content — never reasoning/thinking traces. */
export function extractAssistantContent(message: AssistantMessage | undefined): string {
  return message?.content?.trim() ?? "";
}

export function isLikelyReasoningOnlyResponse(message: AssistantMessage | undefined): boolean {
  const content = message?.content?.trim();
  const reasoning = message?.reasoning?.trim();
  return !content && !!reasoning;
}

export function isSuspiciousClientReply(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12) {
    return true;
  }
  if (/^thinking process:/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function isReasoningModel(model: string): boolean {
  return /qwen3/i.test(model);
}

export function reasoningModelHint(model: string): string | null {
  if (isReasoningModel(model)) {
    return "Qwen 3.x models need OPENAI_MAX_TOKENS=8192 or higher so reasoning does not consume the entire reply budget.";
  }
  return null;
}

export function resolveModelMaxTokens(model: string, requested?: number): number {
  const configured = requested ?? Number(process.env.OPENAI_MAX_TOKENS ?? 8192);
  const base = Number.isFinite(configured) && configured > 256 ? configured : 8192;
  if (isReasoningModel(model)) {
    return Math.max(base, 8192);
  }
  return base;
}

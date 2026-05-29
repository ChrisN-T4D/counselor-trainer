import type OpenAI from "openai";

type AssistantMessage = OpenAI.Chat.Completions.ChatCompletionMessage & {
  reasoning?: string | null;
};

export function extractAssistantContent(message: AssistantMessage | undefined): string {
  const content = message?.content?.trim();
  if (content) {
    return content;
  }

  const reasoning = message?.reasoning?.trim();
  if (reasoning) {
    const lines = reasoning
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const lastLine = lines.at(-1);
    if (lastLine && !/^thinking process:/i.test(lastLine) && lastLine.length < 500) {
      return lastLine.replace(/^[\d.*\-\s]+/, "").trim();
    }
  }

  return "";
}

export function isLikelyReasoningOnlyResponse(message: AssistantMessage | undefined): boolean {
  const content = message?.content?.trim();
  const reasoning = message?.reasoning?.trim();
  return !content && !!reasoning;
}

export function reasoningModelHint(model: string): string | null {
  if (/qwen3/i.test(model)) {
    return "Qwen 3.x models use a reasoning channel. Set OPENAI_MAX_TOKENS to at least 4096.";
  }
  return null;
}

import { isReasoningModel } from "@/lib/llm/message-content";
import type { ChatMessage, CompleteOptions } from "@/lib/llm/provider";

export type ReasoningMode = "auto" | "on" | "off";

export function getReasoningMode(): ReasoningMode {
  const raw = process.env.OPENAI_REASONING_MODE?.trim().toLowerCase();
  if (raw === "on" || raw === "true") return "on";
  if (raw === "off" || raw === "false") return "off";
  return "auto";
}

function getLastUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return messages[i].content;
    }
  }
  return "";
}

/** Heuristic: skip Qwen thinking for routine in-session turns. */
export function isSimpleChatTurn(userMessage: string): boolean {
  const text = userMessage.trim();
  if (!text) {
    return true;
  }
  // Long reflective summaries rarely need chain-of-thought for a client reply.
  if (text.length > 500) {
    return false;
  }
  return true;
}

export function shouldAppendNoThink(
  model: string,
  messages: ChatMessage[],
  options?: CompleteOptions,
): boolean {
  if (options?.generation) {
    return false;
  }
  if (!isReasoningModel(model)) {
    return false;
  }

  const mode = options?.reasoning ?? getReasoningMode();
  if (mode === "on") {
    return false;
  }
  if (mode === "off") {
    return true;
  }

  return isSimpleChatTurn(getLastUserMessage(messages));
}

export function withNoThinkDirective(messages: ChatMessage[]): ChatMessage[] {
  const result = messages.map((message) => ({ ...message }));

  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role !== "user") {
      continue;
    }

    const content = result[i].content;
    if (!/\/no_think\b/i.test(content)) {
      result[i] = { ...result[i], content: `${content}\n\n/no_think` };
    }
    break;
  }

  return result;
}

export function prepareChatMessages(
  model: string,
  messages: ChatMessage[],
  options?: CompleteOptions,
): ChatMessage[] {
  if (shouldAppendNoThink(model, messages, options)) {
    return withNoThinkDirective(messages);
  }
  return messages;
}

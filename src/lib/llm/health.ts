import { createOpenAiCompatibleLlm } from "./openai-compatible";
import {
  getLlmConfigIssues,
  getLlmTimeoutMs,
  llmConfigErrorMessage,
  normalizeOpenAiBaseUrl,
} from "./config";
import { extractAssistantContent, isLikelyReasoningOnlyResponse } from "./message-content";
import type { LlmProvider } from "./provider";

export type LlmHealthResult = {
  ok: boolean;
  configured: boolean;
  baseUrl: string | null;
  model: string | null;
  latencyMs: number | null;
  replyPreview: string | null;
  issues: string[];
  error: string | null;
  hint: string | null;
};

export async function checkLlmHealth(): Promise<LlmHealthResult> {
  const issues = getLlmConfigIssues();
  const model = process.env.OPENAI_MODEL?.trim() ?? null;
  const baseUrl = process.env.OPENAI_BASE_URL?.trim()
    ? normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL.trim())
    : null;

  if (issues.length > 0) {
    return {
      ok: false,
      configured: false,
      baseUrl,
      model,
      latencyMs: null,
      replyPreview: null,
      issues,
      error: llmConfigErrorMessage(issues),
      hint: null,
    };
  }

  const llm = createOpenAiCompatibleLlm();
  const start = Date.now();

  try {
    const reply = await llm.complete(
      [{ role: "user", content: "Reply with exactly one word: connected" }],
      { maxTokens: 512, timeoutMs: Math.min(getLlmTimeoutMs(), 90_000) },
    );

    return {
      ok: true,
      configured: true,
      baseUrl,
      model,
      latencyMs: Date.now() - start,
      replyPreview: reply.slice(0, 120),
      issues: [],
      error: null,
      hint: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      configured: true,
      baseUrl,
      model,
      latencyMs: Date.now() - start,
      replyPreview: null,
      issues: [],
      error: message,
      hint: model?.includes("qwen3")
        ? "Qwen 3.x: OPENAI_REASONING_MODE=auto appends /no_think on simple chat turns for faster replies."
        : null,
    };
  }
}

export { extractAssistantContent, isLikelyReasoningOnlyResponse };

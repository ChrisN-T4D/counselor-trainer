export type LlmConfigIssue =
  | "missing_base_url"
  | "localhost_in_production"
  | "missing_model";

export function getLlmConfigIssues(): LlmConfigIssue[] {
  const issues: LlmConfigIssue[] = [];
  const baseUrl = process.env.OPENAI_BASE_URL?.trim();

  if (!baseUrl) {
    issues.push("missing_base_url");
    return issues;
  }

  if (!process.env.OPENAI_MODEL?.trim()) {
    issues.push("missing_model");
  }

  const isProduction = process.env.NODE_ENV === "production";
  const looksLocal =
    baseUrl.includes("localhost") ||
    baseUrl.includes("127.0.0.1") ||
    baseUrl.includes("0.0.0.0");

  if (isProduction && looksLocal) {
    issues.push("localhost_in_production");
  }

  return issues;
}

export function llmConfigErrorMessage(issues: LlmConfigIssue[]): string {
  if (issues.includes("missing_base_url")) {
    return "LLM is not configured. Set OPENAI_BASE_URL on the server (e.g. your Ollama URL ending in /v1).";
  }
  if (issues.includes("localhost_in_production")) {
    return "OPENAI_BASE_URL points to localhost, which the deployed app cannot reach. Use a public Ollama or API endpoint.";
  }
  if (issues.includes("missing_model")) {
    return "Set OPENAI_MODEL to a model available on your LLM host (e.g. llama3.1).";
  }
  return "LLM configuration is invalid.";
}

export function normalizeOpenAiBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

export function getLlmTimeoutMs(): number {
  const value = Number(process.env.OPENAI_TIMEOUT_MS ?? 180_000);
  return Number.isFinite(value) && value > 0 ? value : 180_000;
}

/** Output token budget for in-session client replies (not the input context window). */
export function getChatMaxTokens(): number {
  const chat = Number(process.env.OPENAI_CHAT_MAX_TOKENS);
  if (Number.isFinite(chat) && chat > 256) {
    return chat;
  }
  const legacy = Number(process.env.OPENAI_MAX_TOKENS ?? 2048);
  return Number.isFinite(legacy) && legacy > 256 ? legacy : 2048;
}

export function getChatRetryMaxTokens(): number {
  return Math.min(Math.max(getChatMaxTokens() * 2, 2048), 4096);
}

/** Ollama `think: false` on chat turns. Off by default — some Qwen builds return empty content with it. */
export function shouldDisableReasoningForChat(model: string): boolean {
  const flag = process.env.OPENAI_DISABLE_REASONING?.trim().toLowerCase();
  if (flag === "true" || flag === "1" || flag === "yes") {
    return /qwen3/i.test(model);
  }
  return false;
}

/** 0 = no timeout (scenario generation may run as long as the model needs). */
export function getScenarioGenerationTimeoutMs(): number {
  const raw = process.env.SCENARIO_GENERATION_TIMEOUT_MS?.trim().toLowerCase();
  if (!raw || raw === "0" || raw === "none" || raw === "off" || raw === "unlimited") {
    return 0;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function getScenarioMaxTokens(): number {
  const value = Number(process.env.SCENARIO_MAX_TOKENS ?? 8192);
  return Number.isFinite(value) && value > 500 ? value : 8192;
}

/**
 * Model for structured JSON tasks (scenario generation, memory consolidation).
 * The in-session client brain (OPENAI_MODEL) is typically an uncensored roleplay
 * model that is poor at strict JSON, so these tasks route to a dedicated
 * instruction-following model instead (e.g. a dolphin variant).
 */
export function getStructuredModel(): string {
  return (
    process.env.OPENAI_JSON_MODEL?.trim() ||
    process.env.OPENAI_SCENARIO_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "llama3.1"
  );
}

/** Optional faster/smaller model for one-shot scenario JSON (falls back to OPENAI_MODEL). */
export function getScenarioModel(): string {
  return (
    process.env.OPENAI_SCENARIO_MODEL?.trim() ||
    process.env.OPENAI_JSON_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "llama3.1"
  );
}

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

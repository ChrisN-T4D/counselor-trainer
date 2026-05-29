export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmConfigError";
  }
}

export class LlmTimeoutError extends Error {
  constructor(message = "LLM request timed out") {
    super(message);
    this.name = "LlmTimeoutError";
  }
}

export class LlmResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmResponseError";
  }
}

export function classifyLlmError(error: unknown): {
  status: number;
  message: string;
  code: string;
} {
  if (error instanceof LlmConfigError) {
    return { status: 503, message: error.message, code: "llm_config" };
  }
  if (error instanceof LlmTimeoutError) {
    return {
      status: 504,
      message: "The model took too long to respond. Try again or use a smaller/faster model.",
      code: "llm_timeout",
    };
  }
  if (error instanceof LlmResponseError) {
    return { status: 502, message: error.message, code: "llm_response" };
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("timed out") || lower.includes("timeout")) {
    return {
      status: 504,
      message: "The model took too long to respond. Try again or use a smaller/faster model.",
      code: "llm_timeout",
    };
  }

  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("connection") ||
    lower.includes("network")
  ) {
    return {
      status: 502,
      message:
        "Cannot reach the LLM server. Check OPENAI_BASE_URL is correct and reachable from this host.",
      code: "llm_unreachable",
    };
  }

  if (lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist"))) {
    return {
      status: 502,
      message: `Model not found on LLM host. Check OPENAI_MODEL matches a model you have pulled (current: ${process.env.OPENAI_MODEL ?? "unset"}).`,
      code: "llm_model_not_found",
    };
  }

  if (error instanceof SyntaxError || lower.includes("json")) {
    return {
      status: 502,
      message: "The model returned invalid JSON. Try generating again.",
      code: "llm_invalid_json",
    };
  }

  if (error instanceof Error && error.name === "ZodError") {
    return {
      status: 502,
      message: "The model response did not match the expected scenario format. Try again.",
      code: "llm_validation",
    };
  }

  return {
    status: 502,
    message:
      "Could not generate scenario right now. Check OPENAI_BASE_URL and OPENAI_MODEL, then try again.",
    code: "llm_unknown",
  };
}

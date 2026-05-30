export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompleteOptions = {
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
  temperature?: number;
  /** Use higher token floor for one-shot JSON / long outputs (scenario generation). */
  generation?: boolean;
  /** Qwen thinking: auto (default) skips on simple chat turns via /no_think. */
  reasoning?: ReasoningMode;
};

export type ReasoningMode = "auto" | "on" | "off";

export interface LlmProvider {
  complete(messages: ChatMessage[], options?: CompleteOptions): Promise<string>;
  stream(messages: ChatMessage[], options?: CompleteOptions): AsyncIterable<string>;
}

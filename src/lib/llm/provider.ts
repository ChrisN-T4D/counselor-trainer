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
};

export interface LlmProvider {
  complete(messages: ChatMessage[], options?: CompleteOptions): Promise<string>;
  stream?(messages: ChatMessage[]): AsyncIterable<string>;
}

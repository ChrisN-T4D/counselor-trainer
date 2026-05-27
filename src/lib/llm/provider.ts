export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface LlmProvider {
  complete(messages: ChatMessage[]): Promise<string>;
  stream?(messages: ChatMessage[]): AsyncIterable<string>;
}

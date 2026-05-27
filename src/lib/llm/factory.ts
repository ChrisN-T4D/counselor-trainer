import { createOpenAiCompatibleLlm } from "./openai-compatible";
import type { LlmProvider } from "./provider";

export function createLlmProvider(): LlmProvider {
  return createOpenAiCompatibleLlm();
}

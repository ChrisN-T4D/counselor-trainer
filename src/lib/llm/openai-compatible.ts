import OpenAI from "openai";
import {
  getLlmConfigIssues,
  llmConfigErrorMessage,
  normalizeOpenAiBaseUrl,
} from "@/lib/llm/config";
import { LlmConfigError } from "@/lib/llm/errors";
import type { ChatMessage, LlmProvider } from "./provider";

const DEFAULT_TIMEOUT_MS = 120_000;

function assertLlmConfigured() {
  const issues = getLlmConfigIssues();
  if (issues.length > 0) {
    throw new LlmConfigError(llmConfigErrorMessage(issues));
  }
}

function createClient() {
  assertLlmConfigured();
  const baseURL = normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL!.trim());

  return new OpenAI({
    baseURL,
    apiKey: process.env.OPENAI_API_KEY ?? "unused",
    timeout: DEFAULT_TIMEOUT_MS,
  });
}

export function createOpenAiCompatibleLlm(): LlmProvider {
  const model = process.env.OPENAI_MODEL?.trim() || "llama3.1";

  return {
    async complete(messages: ChatMessage[]) {
      const client = createClient();
      let response;
      try {
        response = await client.chat.completions.create({
          model,
          messages,
          temperature: 0.7,
          response_format: { type: "json_object" },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        const jsonModeUnsupported =
          message.includes("response_format") ||
          message.includes("json_object") ||
          message.includes("not supported");
        if (!jsonModeUnsupported) {
          throw error;
        }
        response = await client.chat.completions.create({
          model,
          messages,
          temperature: 0.7,
        });
      }

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("LLM returned an empty response");
      }

      return content;
    },

    async *stream(messages: ChatMessage[]) {
      const client = createClient();
      const stream = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.8,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
    },
  };
}

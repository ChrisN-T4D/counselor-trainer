import OpenAI from "openai";
import {
  getLlmConfigIssues,
  getLlmTimeoutMs,
  llmConfigErrorMessage,
  normalizeOpenAiBaseUrl,
} from "@/lib/llm/config";
import { LlmConfigError } from "@/lib/llm/errors";
import type { ChatMessage, CompleteOptions, LlmProvider } from "./provider";

function assertLlmConfigured() {
  const issues = getLlmConfigIssues();
  if (issues.length > 0) {
    throw new LlmConfigError(llmConfigErrorMessage(issues));
  }
}

function createClient(timeoutMs: number) {
  assertLlmConfigured();
  const baseURL = normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL!.trim());

  return new OpenAI({
    baseURL,
    apiKey: process.env.OPENAI_API_KEY ?? "unused",
    timeout: timeoutMs,
  });
}

export function createOpenAiCompatibleLlm(): LlmProvider {
  const defaultModel = process.env.OPENAI_MODEL?.trim() || "llama3.1";

  return {
    async complete(messages: ChatMessage[], options?: CompleteOptions) {
      const model = options?.model ?? defaultModel;
      const timeoutMs = options?.timeoutMs ?? getLlmTimeoutMs();
      const client = createClient(timeoutMs);
      const useJsonMode = options?.jsonMode ?? false;
      const temperature = options?.temperature ?? 0.7;

      const baseParams = {
        model,
        messages,
        temperature,
        ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
      };

      let response;
      if (useJsonMode) {
        try {
          response = await client.chat.completions.create({
            ...baseParams,
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
          response = await client.chat.completions.create(baseParams);
        }
      } else {
        response = await client.chat.completions.create(baseParams);
      }

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("LLM returned an empty response");
      }

      return content;
    },

    async *stream(messages: ChatMessage[]) {
      const client = createClient(getLlmTimeoutMs());
      const stream = await client.chat.completions.create({
        model: defaultModel,
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

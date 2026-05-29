import OpenAI from "openai";
import {
  getChatMaxTokens,
  getLlmConfigIssues,
  getLlmTimeoutMs,
  llmConfigErrorMessage,
  normalizeOpenAiBaseUrl,
} from "@/lib/llm/config";
import { LlmConfigError, LlmResponseError } from "@/lib/llm/errors";
import {
  extractAssistantContent,
  isLikelyReasoningOnlyResponse,
  reasoningModelHint,
} from "@/lib/llm/message-content";
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
    apiKey: process.env.OPENAI_API_KEY?.trim() || "unused",
    timeout: timeoutMs,
  });
}

function resolveMaxTokens(options?: CompleteOptions): number {
  if (options?.maxTokens) {
    return options.maxTokens;
  }
  return getChatMaxTokens();
}

async function runCompletion(
  client: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
) {
  const response = await client.chat.completions.create(params);
  const choice = response.choices[0];
  const content = extractAssistantContent(choice?.message);

  if (!content) {
    if (isLikelyReasoningOnlyResponse(choice?.message)) {
      const hint = reasoningModelHint(String(params.model));
      throw new LlmResponseError(
        hint ??
          "Model returned reasoning output but no speakable content. Increase OPENAI_MAX_TOKENS.",
      );
    }
    throw new LlmResponseError("LLM returned an empty response");
  }

  return content;
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

      const buildParams = (
        maxTokens: number,
        jsonMode: boolean,
      ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming => ({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      });

      let maxTokens = resolveMaxTokens(options);

      const attempt = async (jsonMode: boolean, tokens: number) =>
        runCompletion(client, buildParams(tokens, jsonMode));

      if (useJsonMode) {
        try {
          return await attempt(true, maxTokens);
        } catch (error) {
          const message = error instanceof Error ? error.message.toLowerCase() : "";
          const jsonModeUnsupported =
            message.includes("response_format") ||
            message.includes("json_object") ||
            message.includes("not supported");

          if (jsonModeUnsupported) {
            return await attempt(false, maxTokens);
          }

          if (error instanceof LlmResponseError && maxTokens < 8192) {
            maxTokens = Math.min(maxTokens * 2, 8192);
            return await attempt(true, maxTokens);
          }

          throw error;
        }
      }

      try {
        return await attempt(false, maxTokens);
      } catch (error) {
        if (error instanceof LlmResponseError && maxTokens < 8192) {
          maxTokens = Math.min(maxTokens * 2, 8192);
          return await attempt(false, maxTokens);
        }
        throw error;
      }
    },

    async *stream(messages: ChatMessage[]) {
      const client = createClient(getLlmTimeoutMs());
      const stream = await client.chat.completions.create({
        model: defaultModel,
        messages,
        temperature: 0.8,
        max_tokens: getChatMaxTokens(),
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

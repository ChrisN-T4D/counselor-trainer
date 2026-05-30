import OpenAI from "openai";
import {
  getChatRetryMaxTokens,
  getLlmConfigIssues,
  getLlmTimeoutMs,
  llmConfigErrorMessage,
  normalizeOpenAiBaseUrl,
  shouldDisableReasoningForChat,
} from "@/lib/llm/config";
import { LlmConfigError, LlmResponseError } from "@/lib/llm/errors";
import {
  extractAssistantContent,
  isLikelyReasoningOnlyResponse,
  isSuspiciousClientReply,
  reasoningModelHint,
  resolveChatMaxTokens,
  resolveGenerationMaxTokens,
} from "@/lib/llm/message-content";
import {
  prepareChatMessages,
} from "@/lib/llm/reasoning-mode";
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

function resolveMaxTokens(model: string, options?: CompleteOptions): number {
  if (options?.generation) {
    return resolveGenerationMaxTokens(model, options.maxTokens);
  }
  if (options?.maxTokens != null) {
    return options.maxTokens;
  }
  return resolveChatMaxTokens(model);
}

type ChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParams & {
  think?: boolean;
};

function buildChatParams(
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  options?: CompleteOptions,
  streaming = false,
): ChatParams {
  const temperature = options?.temperature ?? 0.7;
  const jsonMode = options?.jsonMode ?? false;

  return {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: streaming,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    ...(shouldDisableReasoningForChat(model) ? { think: false } : {}),
  };
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
          "Model returned reasoning output but no speakable content. Increase OPENAI_CHAT_MAX_TOKENS.",
      );
    }
    throw new LlmResponseError("LLM returned an empty response");
  }

  if (isSuspiciousClientReply(content)) {
    throw new LlmResponseError(
      `LLM returned an unusably short reply (${JSON.stringify(content)}). Increase OPENAI_CHAT_MAX_TOKENS.`,
    );
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

      let maxTokens = resolveMaxTokens(model, options);
      const retryTokens = options?.generation
        ? Math.min(Math.max(maxTokens * 2, 8192), 16384)
        : getChatRetryMaxTokens();

      const preparedMessages = prepareChatMessages(model, messages, options);

      const attempt = async (jsonMode: boolean, tokens: number) =>
        runCompletion(
          client,
          buildChatParams(model, preparedMessages, tokens, { ...options, jsonMode }, false) as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
        );

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

          if (error instanceof LlmResponseError && maxTokens < retryTokens) {
            return await attempt(true, retryTokens);
          }

          throw error;
        }
      }

      try {
        return await attempt(false, maxTokens);
      } catch (error) {
        if (error instanceof LlmResponseError && maxTokens < retryTokens) {
          return await attempt(false, retryTokens);
        }
        throw error;
      }
    },

    async *stream(messages: ChatMessage[], options?: CompleteOptions) {
      const model = options?.model ?? defaultModel;
      const timeoutMs = options?.timeoutMs ?? getLlmTimeoutMs();
      const client = createClient(timeoutMs);
      const preparedMessages = prepareChatMessages(model, messages, options);
      const maxTokens = resolveMaxTokens(model, options);

      const stream = await client.chat.completions.create(
        buildChatParams(model, preparedMessages, maxTokens, options, true) as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
    },
  };
}

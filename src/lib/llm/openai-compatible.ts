import OpenAI from "openai";
import type { ChatMessage, LlmProvider } from "./provider";

function createClient() {
  return new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY ?? "unused",
  });
}

export function createOpenAiCompatibleLlm(): LlmProvider {
  const model = process.env.OPENAI_MODEL ?? "llama3.1";

  return {
    async complete(messages: ChatMessage[]) {
      const client = createClient();
      const response = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.8,
      });

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

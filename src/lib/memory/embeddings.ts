import OpenAI from "openai";
import { getLlmConfigIssues, normalizeOpenAiBaseUrl } from "@/lib/llm/config";

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

const EMBEDDING_TIMEOUT_MS = Number(process.env.EMBEDDING_TIMEOUT_MS ?? 15_000);

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Embedding request timed out")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function createOllamaEmbeddingProvider(): EmbeddingProvider {
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "nomic-embed-text";

  return {
    async embed(text: string) {
      if (getLlmConfigIssues().includes("missing_base_url")) {
        throw new Error("OPENAI_BASE_URL is not configured for embeddings");
      }

      const client = new OpenAI({
        baseURL: normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL!.trim()),
        apiKey: process.env.OPENAI_API_KEY ?? "unused",
        timeout: EMBEDDING_TIMEOUT_MS,
      });

      const response = await withTimeout(
        client.embeddings.create({
          model,
          input: text,
        }),
        EMBEDDING_TIMEOUT_MS,
      );

      const embedding = response.data[0]?.embedding;
      if (!embedding?.length) {
        throw new Error("Embedding provider returned empty vector");
      }

      return normalize(embedding);
    },
  };
}

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

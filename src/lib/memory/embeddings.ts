import OpenAI from "openai";

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

export function createOllamaEmbeddingProvider(): EmbeddingProvider {
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "nomic-embed-text";

  return {
    async embed(text: string) {
      const client = new OpenAI({
        baseURL: process.env.OPENAI_BASE_URL,
        apiKey: process.env.OPENAI_API_KEY ?? "unused",
      });

      const response = await client.embeddings.create({
        model,
        input: text,
      });

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

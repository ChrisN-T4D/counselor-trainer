import { Prisma } from "@/generated/prisma/client";
import type { MemoryChunkSourceType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  BIOPSYCHOSOCIAL_SECTIONS,
  type BiopsychosocialWriteup,
} from "@/lib/scenarios/case-writeup";
import {
  createOllamaEmbeddingProvider,
  toVectorLiteral,
  type EmbeddingProvider,
} from "@/lib/memory/embeddings";

export type RetrievedChunk = {
  id: string;
  content: string;
  sourceType: MemoryChunkSourceType;
  similarity: number;
};

let embeddingProvider: EmbeddingProvider | null = null;

function getEmbeddingProvider() {
  if (!embeddingProvider) {
    embeddingProvider = createOllamaEmbeddingProvider();
  }
  return embeddingProvider;
}

export async function insertMemoryChunk(
  clientCaseId: string,
  sourceType: MemoryChunkSourceType,
  content: string,
  metadata: Record<string, unknown> | null,
  embedding: number[] | null,
) {
  const id = crypto.randomUUID();

  if (embedding) {
    await db.$executeRaw`
      INSERT INTO "MemoryChunk" ("id", "clientCaseId", "sourceType", "content", "metadata", "embedding", "createdAt")
      VALUES (
        ${id},
        ${clientCaseId},
        ${sourceType}::"MemoryChunkSourceType",
        ${content},
        ${metadata ? JSON.stringify(metadata) : null}::jsonb,
        ${toVectorLiteral(embedding)}::vector,
        NOW()
      )
    `;
    return id;
  }

  await db.memoryChunk.create({
    data: {
      id,
      clientCaseId,
      sourceType,
      content,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });

  return id;
}

export async function indexCaseWriteup(clientCaseId: string, writeup: BiopsychosocialWriteup) {
  const embedder = getEmbeddingProvider();

  for (const section of BIOPSYCHOSOCIAL_SECTIONS) {
    const content = `${section.label}: ${writeup[section.key]}`;
    let embedding: number[] | null = null;
    try {
      embedding = await embedder.embed(content);
    } catch (error) {
      console.warn("Embedding failed for case writeup chunk; storing without vector:", error);
    }

    await insertMemoryChunk(clientCaseId, "CASE_WRITEUP", content, { section: section.key }, embedding);
  }
}

export async function indexTextChunk(
  clientCaseId: string,
  sourceType: MemoryChunkSourceType,
  content: string,
  metadata: Record<string, unknown>,
) {
  let embedding: number[] | null = null;
  try {
    embedding = await getEmbeddingProvider().embed(content);
  } catch (error) {
    console.warn(`Embedding failed for ${sourceType}; storing without vector:`, error);
  }

  await insertMemoryChunk(clientCaseId, sourceType, content, metadata, embedding);
}

async function clientCaseHasVectorChunks(clientCaseId: string): Promise<boolean> {
  try {
    const rows = await db.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1 FROM "MemoryChunk"
        WHERE "clientCaseId" = ${clientCaseId} AND "embedding" IS NOT NULL
      ) AS exists
    `;
    return rows[0]?.exists ?? false;
  } catch {
    return false;
  }
}

export async function retrieveRelevantMemory(
  clientCaseId: string,
  queryText: string,
  topK = Number(process.env.MEMORY_RAG_TOP_K ?? 6),
): Promise<RetrievedChunk[]> {
  const caseWriteupChunks = await db.memoryChunk.findMany({
    where: { clientCaseId, sourceType: "CASE_WRITEUP" },
    orderBy: { createdAt: "asc" },
  });

  let ranked: RetrievedChunk[] = [];
  const hasVectors = await clientCaseHasVectorChunks(clientCaseId);

  if (hasVectors) {
    try {
      const queryEmbedding = await getEmbeddingProvider().embed(queryText);
      const rows = await db.$queryRaw<
        Array<{ id: string; content: string; sourceType: MemoryChunkSourceType; similarity: number }>
      >`
        SELECT
          "id",
          "content",
          "sourceType",
          1 - ("embedding" <=> ${toVectorLiteral(queryEmbedding)}::vector) AS similarity
        FROM "MemoryChunk"
        WHERE "clientCaseId" = ${clientCaseId}
          AND "embedding" IS NOT NULL
          AND "sourceType" != 'CASE_WRITEUP'
        ORDER BY "embedding" <=> ${toVectorLiteral(queryEmbedding)}::vector
        LIMIT ${topK}
      `;
      ranked = rows;
    } catch (error) {
      console.warn("Vector retrieval failed; falling back to recent non-writeup chunks:", error);
    }
  }

  if (ranked.length === 0) {
    const recent = await db.memoryChunk.findMany({
      where: { clientCaseId, sourceType: { not: "CASE_WRITEUP" } },
      orderBy: { createdAt: "desc" },
      take: topK,
    });
    ranked = recent.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      sourceType: chunk.sourceType,
      similarity: 0,
    }));
  }

  const merged = new Map<string, RetrievedChunk>();
  for (const chunk of caseWriteupChunks) {
    merged.set(chunk.id, {
      id: chunk.id,
      content: chunk.content,
      sourceType: chunk.sourceType,
      similarity: 1,
    });
  }
  for (const chunk of ranked) {
    merged.set(chunk.id, chunk);
  }

  return [...merged.values()];
}

export function formatRetrievedMemory(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "No additional retrieved memory.";
  }

  const maxChars = Number(process.env.MEMORY_RAG_MAX_CHARS ?? 4000);
  let used = 0;
  const lines: string[] = [];

  for (const chunk of chunks) {
    const line = `- [${chunk.sourceType}] ${chunk.content}`;
    if (used + line.length > maxChars) {
      break;
    }
    lines.push(line);
    used += line.length;
  }

  return lines.join("\n");
}

-- Enable pgvector for RAG memory
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "ClientCaseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "CaseSnapshotSource" AS ENUM ('CASE_INIT', 'SESSION_END', 'MANUAL_REVIEW');
CREATE TYPE "MemoryChunkSourceType" AS ENUM (
  'CASE_WRITEUP',
  'SESSION_SUMMARY',
  'DISCLOSED_FACT',
  'RELATIONSHIP_NOTE',
  'SAFETY_NOTE'
);

-- CreateTable ClientCase
CREATE TABLE "ClientCase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "status" "ClientCaseStatus" NOT NULL DEFAULT 'ACTIVE',
  "displayName" TEXT NOT NULL,
  "sessionCount" INTEGER NOT NULL DEFAULT 0,
  "relationshipState" JSONB NOT NULL,
  "safetyState" JSONB NOT NULL,
  "therapyGoalProgress" JSONB NOT NULL,
  "disclosedFacts" JSONB NOT NULL DEFAULT '[]',
  "lastSessionAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable CaseStateSnapshot
CREATE TABLE "CaseStateSnapshot" (
  "id" TEXT NOT NULL,
  "clientCaseId" TEXT NOT NULL,
  "sessionId" TEXT,
  "sessionNumber" INTEGER,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" "CaseSnapshotSource" NOT NULL,
  "relationship" JSONB NOT NULL,
  "safety" JSONB NOT NULL,
  "delta" JSONB,
  "rationale" TEXT,

  CONSTRAINT "CaseStateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable MemoryChunk (embedding column added below)
CREATE TABLE "MemoryChunk" (
  "id" TEXT NOT NULL,
  "clientCaseId" TEXT NOT NULL,
  "sourceType" "MemoryChunkSourceType" NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemoryChunk_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MemoryChunk" ADD COLUMN "embedding" vector(768);

-- AlterTable Session
ALTER TABLE "Session"
ADD COLUMN "clientCaseId" TEXT,
ADD COLUMN "sessionNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "episodicSummary" TEXT,
ADD COLUMN "memorySnapshot" JSONB;

-- CreateIndex
CREATE INDEX "ClientCase_userId_idx" ON "ClientCase"("userId");
CREATE INDEX "ClientCase_scenarioId_idx" ON "ClientCase"("scenarioId");
CREATE INDEX "ClientCase_userId_scenarioId_idx" ON "ClientCase"("userId", "scenarioId");
CREATE INDEX "CaseStateSnapshot_clientCaseId_capturedAt_idx" ON "CaseStateSnapshot"("clientCaseId", "capturedAt");
CREATE INDEX "MemoryChunk_clientCaseId_idx" ON "MemoryChunk"("clientCaseId");
CREATE INDEX "MemoryChunk_clientCaseId_sourceType_idx" ON "MemoryChunk"("clientCaseId", "sourceType");
CREATE INDEX "Session_clientCaseId_idx" ON "Session"("clientCaseId");

-- AddForeignKey
ALTER TABLE "ClientCase" ADD CONSTRAINT "ClientCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientCase" ADD CONSTRAINT "ClientCase_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseStateSnapshot" ADD CONSTRAINT "CaseStateSnapshot_clientCaseId_fkey" FOREIGN KEY ("clientCaseId") REFERENCES "ClientCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_clientCaseId_fkey" FOREIGN KEY ("clientCaseId") REFERENCES "ClientCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_clientCaseId_fkey" FOREIGN KEY ("clientCaseId") REFERENCES "ClientCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vector index for cosine similarity search
CREATE INDEX "MemoryChunk_embedding_idx" ON "MemoryChunk" USING hnsw ("embedding" vector_cosine_ops);

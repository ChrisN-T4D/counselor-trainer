import type { Scenario } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  getCaseWriteup,
  initializeRelationshipState,
  initializeSafetyState,
  initializeTherapyGoals,
  parseStoredRelationshipState,
  parseStoredSafetyState,
  parseStoredTherapyGoals,
} from "@/lib/memory/case-init";
import { indexCaseWriteup } from "@/lib/memory/rag";
import {
  applyConsolidation,
  consolidateSessionMemory,
  persistConsolidationChunks,
} from "@/lib/memory/consolidate";
import { createLlmProvider } from "@/lib/llm/factory";
import {
  buildConversationMessagesWithContext,
  buildOpeningUserPrompt,
  buildSessionContext,
} from "@/lib/sessions/prompts";

const OPENING_TIMEOUT_MS = Number(process.env.OPENING_TIMEOUT_MS ?? 90_000);

const practiceSessionInclude = {
  scenario: true,
  clientCase: true,
  messages: { orderBy: { sequence: "asc" as const } },
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("LLM opening timed out")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function createClientCase(userId: string, scenario: Scenario) {
  const writeup = getCaseWriteup(scenario);
  const relationshipState = initializeRelationshipState(scenario);
  const safetyState = initializeSafetyState(scenario, writeup);
  const therapyGoalProgress = initializeTherapyGoals(scenario);

  const clientCase = await db.clientCase.create({
    data: {
      userId,
      scenarioId: scenario.id,
      displayName: scenario.title,
      relationshipState,
      safetyState,
      therapyGoalProgress,
      disclosedFacts: [],
      stateSnapshots: {
        create: {
          source: "CASE_INIT",
          relationship: relationshipState,
          safety: safetyState,
          rationale: "Initial case state derived from scenario profile.",
        },
      },
    },
    include: { scenario: true },
  });

  if (writeup) {
    try {
      await indexCaseWriteup(clientCase.id, writeup);
    } catch (error) {
      console.warn("Failed to index case writeup for RAG:", error);
    }
  }

  return clientCase;
}

export async function findOrCreateClientCase(userId: string, scenarioId: string) {
  const existing = await db.clientCase.findFirst({
    where: { userId, scenarioId, status: "ACTIVE" },
    include: { scenario: true },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    return existing;
  }

  const scenario = await db.scenario.findUnique({ where: { id: scenarioId } });
  if (!scenario) {
    throw new Error("Scenario not found");
  }

  return createClientCase(userId, scenario);
}

export async function getActiveSessionForCase(clientCaseId: string, userId: string) {
  return db.session.findFirst({
    where: { clientCaseId, userId, status: "ACTIVE" },
    include: practiceSessionInclude,
  });
}

export async function getActiveSessionForScenario(userId: string, scenarioId: string) {
  return db.session.findFirst({
    where: { userId, scenarioId, status: "ACTIVE" },
    include: practiceSessionInclude,
    orderBy: { startedAt: "desc" },
  });
}

async function linkSessionToClientCase(sessionId: string, clientCaseId: string) {
  await db.session.update({
    where: { id: sessionId },
    data: { clientCaseId },
  });
}

async function reloadPracticeSession(sessionId: string) {
  return db.session.findFirst({
    where: { id: sessionId },
    include: practiceSessionInclude,
  });
}

export async function startCaseSession(userId: string, clientCaseId: string) {
  const clientCase = await db.clientCase.findFirst({
    where: { id: clientCaseId, userId },
    include: { scenario: true },
  });

  if (!clientCase) {
    throw new Error("Client case not found");
  }

  const activeForCase = await getActiveSessionForCase(clientCaseId, userId);
  if (activeForCase) {
    return activeForCase;
  }

  const activeForScenario = await getActiveSessionForScenario(userId, clientCase.scenarioId);
  if (activeForScenario) {
    if (activeForScenario.clientCaseId !== clientCaseId) {
      await linkSessionToClientCase(activeForScenario.id, clientCaseId);
    }
    const reloaded = await reloadPracticeSession(activeForScenario.id);
    if (reloaded) {
      return reloaded;
    }
  }

  const sessionNumber = clientCase.sessionCount + 1;
  const relationshipState = parseStoredRelationshipState(clientCase.relationshipState);
  const safetyState = parseStoredSafetyState(clientCase.safetyState);
  const therapyGoals = parseStoredTherapyGoals(clientCase.therapyGoalProgress);
  const disclosedFacts = Array.isArray(clientCase.disclosedFacts)
    ? (clientCase.disclosedFacts as string[])
    : [];

  const priorSummaries = await db.session.findMany({
    where: { clientCaseId, status: "COMPLETED", episodicSummary: { not: null } },
    orderBy: { sessionNumber: "asc" },
    select: { sessionNumber: true, episodicSummary: true },
  });

  const context = await buildSessionContext({
    scenario: clientCase.scenario,
    clientCase,
    relationshipState,
    safetyState,
    therapyGoals,
    disclosedFacts,
    priorSessionSummaries: priorSummaries.map((item) => ({
      sessionNumber: item.sessionNumber,
      summary: item.episodicSummary ?? "",
    })),
    sessionNumber,
    latestTherapistMessage: null,
  });

  const llm = createLlmProvider();
  const openingMessages = [
    ...buildConversationMessagesWithContext(context, []),
    { role: "user" as const, content: buildOpeningUserPrompt(sessionNumber) },
  ];

  const clientOpening = await withTimeout(llm.complete(openingMessages), OPENING_TIMEOUT_MS);

  const practiceSession = await db.$transaction(async (tx) => {
    const created = await tx.session.create({
      data: {
        userId,
        scenarioId: clientCase.scenarioId,
        clientCaseId,
        sessionNumber,
        messages: {
          create: [{ role: "CLIENT", content: clientOpening, sequence: 1 }],
        },
      },
      include: practiceSessionInclude,
    });

    await tx.clientCase.update({
      where: { id: clientCaseId },
      data: {
        sessionCount: sessionNumber,
        lastSessionAt: new Date(),
      },
    });

    return created;
  });

  return practiceSession;
}

export async function finalizeSessionMemory(sessionId: string, userId: string) {
  const practiceSession = await db.session.findFirst({
    where: { id: sessionId, userId, status: "COMPLETED" },
    include: {
      scenario: true,
      clientCase: true,
      messages: { orderBy: { sequence: "asc" } },
    },
  });

  if (!practiceSession?.clientCase) {
    return null;
  }

  const clientCase = practiceSession.clientCase;
  const relationshipState = parseStoredRelationshipState(clientCase.relationshipState);
  const safetyState = parseStoredSafetyState(clientCase.safetyState);
  const therapyGoals = parseStoredTherapyGoals(clientCase.therapyGoalProgress);
  const disclosedFacts = Array.isArray(clientCase.disclosedFacts)
    ? (clientCase.disclosedFacts as string[])
    : [];

  const transcript = practiceSession.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const result = await consolidateSessionMemory({
    scenario: practiceSession.scenario,
    transcript,
    relationshipState,
    safetyState,
    therapyGoals,
    sessionNumber: practiceSession.sessionNumber,
  });

  const applied = applyConsolidation({
    relationshipState,
    safetyState,
    therapyGoals,
    disclosedFacts,
    result,
  });

  await db.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: sessionId },
      data: {
        episodicSummary: result.episodicSummary,
        memorySnapshot: {
          relationship: applied.relationship,
          safety: applied.safety,
          therapyGoals: applied.therapyGoals,
        },
      },
    });

    await tx.clientCase.update({
      where: { id: clientCase.id },
      data: {
        relationshipState: applied.relationship,
        safetyState: applied.safety,
        therapyGoalProgress: applied.therapyGoals,
        disclosedFacts: applied.disclosedFacts,
        lastSessionAt: new Date(),
      },
    });

    await tx.caseStateSnapshot.create({
      data: {
        clientCaseId: clientCase.id,
        sessionId,
        sessionNumber: practiceSession.sessionNumber,
        source: "SESSION_END",
        relationship: applied.relationship,
        safety: applied.safety,
        delta: {
          relationship: result.relationshipDelta,
          safety: result.safetyDelta,
        },
        rationale: `${result.relationshipRationale} ${result.safetyRationale}`,
      },
    });
  });

  try {
    await persistConsolidationChunks(
      clientCase.id,
      sessionId,
      practiceSession.sessionNumber,
      result,
    );
  } catch (error) {
    console.warn("Failed to persist consolidation memory chunks:", error);
  }

  return result;
}

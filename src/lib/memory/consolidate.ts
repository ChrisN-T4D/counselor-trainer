import { z } from "zod";
import type { Scenario } from "@/generated/prisma/client";
import { createLlmProvider } from "@/lib/llm/factory";
import {
  applyRelationshipDelta,
  relationshipDeltaSchema,
  type RelationshipState,
} from "@/lib/memory/relationship-state";
import {
  applySafetyDelta,
  safetyDeltaSchema,
  type SafetyState,
} from "@/lib/memory/safety-state";
import type { TherapyGoalProgress } from "@/lib/memory/case-init";
import { indexTextChunk } from "@/lib/memory/rag";

const goalProgressUpdateSchema = z.object({
  objective: z.string(),
  delta: z.number().min(-10).max(15),
  evidence: z.string(),
});

export const consolidationResultSchema = z.object({
  episodicSummary: z.string().min(20),
  relationshipDelta: relationshipDeltaSchema,
  safetyDelta: safetyDeltaSchema,
  relationshipRationale: z.string().min(10),
  safetyRationale: z.string().min(10),
  goalProgressUpdates: z.array(goalProgressUpdateSchema).default([]),
  newDisclosedFacts: z.array(z.string()).default([]),
  relationshipNote: z.string().min(10),
  safetyNote: z.string().min(10),
  ruptureDetected: z.boolean().default(false),
  repairAttempted: z.boolean().default(false),
});

export type ConsolidationResult = z.infer<typeof consolidationResultSchema>;

function parseLlmJson(content: string): unknown {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    return JSON.parse(trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  }
  return JSON.parse(trimmed);
}

function formatTranscript(transcript: { role: string; content: string }[]) {
  return transcript.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
}

export async function consolidateSessionMemory(input: {
  scenario: Scenario;
  transcript: { role: string; content: string }[];
  relationshipState: RelationshipState;
  safetyState: SafetyState;
  therapyGoals: TherapyGoalProgress[];
  sessionNumber: number;
}): Promise<ConsolidationResult> {
  const llm = createLlmProvider();

  const prompt = `Analyze this counseling training session transcript and return ONLY JSON.

Scenario: ${input.scenario.title}
Session number: ${input.sessionNumber}
Objectives: ${input.scenario.objectives.join("; ")}

Current relationship state:
${JSON.stringify(input.relationshipState)}

Current safety state:
${JSON.stringify(input.safetyState)}

Transcript:
${formatTranscript(input.transcript)}

Return JSON:
{
  "episodicSummary": string,
  "relationshipDelta": { trust?, openness?, alliance?, resistance?, deception?, emotionalRegulation?, goalProgress?, dropoutRisk?, ruptureActive?, repairAttempts? },
  "safetyDelta": { siFrequency?, selfHarmRisk?, substanceUseSeverity?, riskyBehaviorLevel?, protectiveFactorsStrength?, escalationRisk?, safetyPlanEngagement?, disclosedToTherapist?: { si?, substances?, riskyBehavior?, selfHarm? }, immediateSafetyConcern? },
  "relationshipRationale": string,
  "safetyRationale": string,
  "goalProgressUpdates": [{ "objective": string, "delta": number, "evidence": string }],
  "newDisclosedFacts": string[],
  "relationshipNote": string,
  "safetyNote": string,
  "ruptureDetected": boolean,
  "repairAttempted": boolean
}

Rules:
- Use small bounded deltas (typically -8 to +8 for numeric fields).
- Do not change canonical case facts.
- Update disclosedToTherapist flags only if therapist asked appropriately and client would plausibly disclose.
- If safety screening was missed, do not mark SI/substances as disclosed.`;

  const raw = await llm.complete([
    {
      role: "system",
      content: "You analyze counseling sessions for training simulations. Output strict JSON only.",
    },
    { role: "user", content: prompt },
  ]);

  return consolidationResultSchema.parse(parseLlmJson(raw));
}

export function applyConsolidation(input: {
  relationshipState: RelationshipState;
  safetyState: SafetyState;
  therapyGoals: TherapyGoalProgress[];
  disclosedFacts: string[];
  result: ConsolidationResult;
}) {
  let relationship = applyRelationshipDelta(input.relationshipState, input.result.relationshipDelta);
  let safety = applySafetyDelta(input.safetyState, input.result.safetyDelta);

  if (input.result.ruptureDetected) {
    relationship = applyRelationshipDelta(relationship, {
      ruptureActive: true,
      trust: -3,
      alliance: -4,
      dropoutRisk: 4,
    });
  }

  if (input.result.repairAttempted) {
    relationship = applyRelationshipDelta(relationship, {
      repairAttempts: 1,
      ruptureActive: false,
      alliance: 2,
    });
  }

  const goalMap = new Map(input.therapyGoals.map((goal) => [goal.objective, goal.progress]));
  for (const update of input.result.goalProgressUpdates) {
    const current = goalMap.get(update.objective) ?? 0;
    goalMap.set(update.objective, Math.min(100, Math.max(0, current + update.delta)));
  }

  const therapyGoals = input.therapyGoals.map((goal) => ({
    objective: goal.objective,
    progress: goalMap.get(goal.objective) ?? goal.progress,
  }));

  const aggregateGoalProgress =
    therapyGoals.reduce((sum, goal) => sum + goal.progress, 0) / Math.max(1, therapyGoals.length);
  relationship = applyRelationshipDelta(relationship, {
    goalProgress: Math.round(aggregateGoalProgress - relationship.goalProgress),
  });

  const disclosedFacts = [
    ...input.disclosedFacts,
    ...input.result.newDisclosedFacts.filter((fact) => !input.disclosedFacts.includes(fact)),
  ];

  return { relationship, safety, therapyGoals, disclosedFacts };
}

export async function persistConsolidationChunks(
  clientCaseId: string,
  sessionId: string,
  sessionNumber: number,
  result: ConsolidationResult,
) {
  await indexTextChunk(clientCaseId, "SESSION_SUMMARY", result.episodicSummary, {
    sessionId,
    sessionNumber,
  });
  await indexTextChunk(clientCaseId, "RELATIONSHIP_NOTE", result.relationshipNote, {
    sessionId,
    sessionNumber,
  });
  await indexTextChunk(clientCaseId, "SAFETY_NOTE", result.safetyNote, { sessionId, sessionNumber });

  for (const fact of result.newDisclosedFacts) {
    await indexTextChunk(clientCaseId, "DISCLOSED_FACT", fact, { sessionId, sessionNumber });
  }
}

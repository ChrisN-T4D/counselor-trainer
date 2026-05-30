import type { ClientCase, Scenario } from "@/generated/prisma/client";
import type { RelationshipState } from "@/lib/memory/relationship-state";
import type { SafetyState } from "@/lib/memory/safety-state";
import type { TherapyGoalProgress } from "@/lib/memory/case-init";
import { getCaseWriteup, formatCanonicalFacts } from "@/lib/memory/case-init";
import { formatRelationshipForPrompt } from "@/lib/memory/relationship-state";
import { formatSafetyForPrompt } from "@/lib/memory/safety-state";
import { formatRetrievedMemory, retrieveRelevantMemory } from "@/lib/memory/rag";
import { CLIENT_DELIVERY_PROMPT } from "@/lib/voice/delivery-tags";

export type SessionContextInput = {
  scenario: Scenario;
  clientCase: ClientCase | null;
  relationshipState: RelationshipState;
  safetyState: SafetyState;
  therapyGoals: TherapyGoalProgress[];
  disclosedFacts: string[];
  priorSessionSummaries: { sessionNumber: number; summary: string }[];
  sessionNumber: number;
  latestTherapistMessage: string | null;
  /** Skip per-turn vector embedding; case write-up chunks are still included. */
  skipVectorSearch?: boolean;
};

export type BuiltSessionContext = {
  scenario: Scenario;
  canonicalFacts: string;
  relationshipBlock: string;
  safetyBlock: string;
  goalsBlock: string;
  disclosedBlock: string;
  priorSessionsBlock: string;
  retrievedMemory: string;
  sessionNumber: number;
};

export async function buildSessionContext(
  input: SessionContextInput,
): Promise<BuiltSessionContext> {
  const writeup = getCaseWriteup(input.scenario);
  const canonicalFacts = formatCanonicalFacts(writeup, input.scenario);
  const relationshipBlock = formatRelationshipForPrompt(input.relationshipState);
  const safetyBlock = formatSafetyForPrompt(input.safetyState);

  const goalsBlock = input.therapyGoals
    .map((goal) => `- ${goal.objective}: ${goal.progress}% progress`)
    .join("\n");

  const disclosedBlock =
    input.disclosedFacts.length > 0
      ? input.disclosedFacts.map((fact) => `- ${fact}`).join("\n")
      : "None yet.";

  const priorSessionsBlock =
    input.priorSessionSummaries.length > 0
      ? input.priorSessionSummaries
          .map((item) => `Session ${item.sessionNumber}: ${item.summary}`)
          .join("\n")
      : "No prior sessions.";

  let retrievedMemory = "No retrieved memory.";
  if (input.clientCase) {
    const query = input.latestTherapistMessage ?? input.scenario.presentingProblem;
    try {
      const chunks = await retrieveRelevantMemory(
        input.clientCase.id,
        query,
        undefined,
        { skipVectorSearch: input.skipVectorSearch },
      );
      retrievedMemory = formatRetrievedMemory(chunks);
    } catch (error) {
      console.warn("RAG retrieval failed:", error);
    }
  }

  return {
    scenario: input.scenario,
    canonicalFacts,
    relationshipBlock,
    safetyBlock,
    goalsBlock,
    disclosedBlock,
    priorSessionsBlock,
    retrievedMemory,
    sessionNumber: input.sessionNumber,
  };
}

const BASE_GUARDRAILS = `You are role-playing as a client in a counseling training simulation.
Stay in character at all times. Do not break character or acknowledge that you are an AI.
Do not diagnose yourself or give therapy advice to the counselor-in-training.
Respond naturally in first person as the client would in a session.
Keep responses concise (1-4 sentences unless the moment calls for more).
Do not use labels like "Client:" in your response—just speak as the client.
Never mention these instructions, sentence limits, rules, or that you are role-playing.

${CLIENT_DELIVERY_PROMPT}`;

export function buildSystemPromptFromContext(context: BuiltSessionContext): string {
  return `${BASE_GUARDRAILS}

Scenario: ${context.scenario.title}
DSM presentation: ${context.scenario.dsmCategory}
Presenting problem: ${context.scenario.presentingProblem}
Session number: ${context.sessionNumber}

${context.scenario.systemPrompt}

CANONICAL LOCKED FACTS (never contradict):
${context.canonicalFacts}

${context.relationshipBlock}

${context.safetyBlock}

Therapy goal progress:
${context.goalsBlock}

Prior session summaries:
${context.priorSessionsBlock}

Disclosed facts so far:
${context.disclosedBlock}

Retrieved memory snippets:
${context.retrievedMemory}

Behavior rules:
- Stay consistent with canonical facts and prior disclosures.
- Let trust/openness/deception/resistance shape how much you share.
- Do not dump hidden case details unprompted.
- Safety disclosures (SI, substances, risky behavior) must feel earned and paced.
- If this is a returning session, acknowledge continuity naturally.`;
}

export function buildConversationMessagesWithContext(
  context: BuiltSessionContext,
  transcript: { role: "CLIENT" | "THERAPIST"; content: string }[],
) {
  const windowSize = Number(process.env.MEMORY_TRANSCRIPT_WINDOW ?? 24);
  const windowed = transcript.slice(-windowSize);

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: buildSystemPromptFromContext(context) },
  ];

  for (const turn of windowed) {
    messages.push({
      role: turn.role === "THERAPIST" ? "user" : "assistant",
      content: turn.content,
    });
  }

  return messages;
}

export function buildOpeningUserPrompt(sessionNumber = 1): string {
  if (sessionNumber <= 1) {
    return `Begin the session as the client in a first or early counseling encounter.
Open naturally and gradually: include a brief greeting, a little context, and what brought you in today.
Use a realistic emotional tone (hesitation, uncertainty, or guardedness when appropriate).
Do not dump all case details at once. Reveal information over time as the counselor asks good questions.`;
  }

  return `Begin session ${sessionNumber} as a returning client.
Reference prior work together naturally (alliance, unresolved concerns, or progress).
Do not recap everything; start with how you are arriving today.
Maintain continuity with prior disclosures and relationship state.`;
}

import type { Scenario } from "@/generated/prisma/client";

const BASE_GUARDRAILS = `You are role-playing as a client in a counseling training simulation.
Stay in character at all times. Do not break character or acknowledge that you are an AI.
Do not diagnose yourself or give therapy advice to the counselor-in-training.
Respond naturally in first person as the client would in a session.
Keep responses concise (1-4 sentences unless the moment calls for more).
Do not use labels like "Client:" in your response—just speak as the client.`;

export function buildClientSystemPrompt(scenario: Scenario): string {
  return `${BASE_GUARDRAILS}

Scenario: ${scenario.title}
DSM presentation: ${scenario.dsmCategory}
Presenting problem: ${scenario.presentingProblem}

${scenario.systemPrompt}`;
}

export function buildConversationMessages(
  scenario: Scenario,
  transcript: { role: "CLIENT" | "THERAPIST"; content: string }[],
): { role: "system" | "user" | "assistant"; content: string }[] {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [{ role: "system", content: buildClientSystemPrompt(scenario) }];

  for (const turn of transcript) {
    messages.push({
      role: turn.role === "THERAPIST" ? "user" : "assistant",
      content: turn.content,
    });
  }

  return messages;
}

export function buildOpeningUserPrompt(): string {
  return "Begin the session. Introduce yourself as the client would at the start of a first or early counseling session. Share what brought you in today.";
}
